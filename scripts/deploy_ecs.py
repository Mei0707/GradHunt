#!/usr/bin/env python3
"""Deploy one immutable gateway image; verify the exact revision or restore the prior one."""
import json
import os
import re
import subprocess
import time
import tempfile


def aws(*args):
    result = subprocess.run(['aws', *args, '--output', 'json'], check=True, capture_output=True, text=True)
    return json.loads(result.stdout or '{}')


def deploy():
    cluster, service, image = (os.environ[k] for k in ['ECS_CLUSTER', 'ECS_SERVICE', 'IMAGE_URI'])
    log_group = os.environ['LOG_GROUP']
    if not re.fullmatch(r'\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[a-z0-9/_-]+@sha256:[a-f0-9]{64}', image):
        raise ValueError('IMAGE_URI must be an immutable ECR digest')
    if not os.environ.get('FRONTEND_URL', '').startswith('https://'):
        raise ValueError('FRONTEND_URL must be the public HTTPS origin')
    state = aws('ecs', 'describe-services', '--cluster', cluster, '--services', service)
    if state.get('failures') or len(state.get('services', [])) != 1:
        raise RuntimeError('ECS service not found')
    current = state['services'][0]
    if current.get('deploymentController', {}).get('type', 'ECS') != 'ECS':
        raise RuntimeError('This workflow requires the ECS rolling deployment controller')
    if current.get('deploymentConfiguration', {}).get('strategy', 'ROLLING') != 'ROLLING':
        raise RuntimeError('This workflow requires the ECS rolling deployment strategy')
    if (current['desiredCount'] < 1 or len(current.get('deployments', [])) != 1
            or current['runningCount'] != current['desiredCount'] or current['pendingCount'] != 0
            or current['deployments'][0].get('rolloutState') != 'COMPLETED'):
        raise RuntimeError('Service must be running and stable before deployment')
    previous = current['taskDefinition']
    definition = aws('ecs', 'describe-task-definition', '--task-definition', previous)['taskDefinition']
    if definition['family'] != os.environ['TASK_FAMILY']:
        raise RuntimeError('Task family does not match the configured deployment target')
    container_name = os.environ.get('GATEWAY_CONTAINER', 'gateway')
    matches = [c for c in definition['containerDefinitions'] if c['name'] == container_name]
    if len(matches) != 1:
        raise RuntimeError('Gateway container not found; set GATEWAY_CONTAINER to its existing name')
    gateway = matches[0]
    gateway['image'] = image
    env = {item['name']: item['value'] for item in gateway.get('environment', [])}
    env.update(NODE_ENV='production', ENVIRONMENT=os.environ.get('DEPLOY_ENVIRONMENT', 'production'),
               CLOUDWATCH_EMF='true', FRONTEND_URL=os.environ['FRONTEND_URL'],
               TRUST_PROXY=os.environ.get('TRUST_PROXY') or env.get('TRUST_PROXY', 'false'), RESUME_BUCKET=os.environ['RESUME_BUCKET'])
    env['TRUST_PROXY_HOPS'] = os.environ.get('TRUST_PROXY_HOPS') or env.get('TRUST_PROXY_HOPS', '1')
    secret_names = {s['name'] for s in gateway.get('secrets', [])}
    if not {'MONGODB_URI', 'AUTH_SECRET'}.issubset(secret_names):
        raise RuntimeError('MONGODB_URI and AUTH_SECRET must be injected using ECS secrets before deploying')
    gateway['environment'] = [{'name': name, 'value': value} for name, value in env.items() if name not in secret_names]
    gateway['logConfiguration'] = {'logDriver': 'awslogs', 'options': {
        'awslogs-group': log_group, 'awslogs-region': os.environ['AWS_REGION'], 'awslogs-stream-prefix': 'gateway',
    }}
    gateway['healthCheck'] = {'command': ['CMD-SHELL', 'node -e "fetch(\'http://127.0.0.1:3000/api/health/live\').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"'],
                              'interval': 30, 'timeout': 5, 'retries': 3, 'startPeriod': 30}
    gateway['stopTimeout'] = 30
    allowed = {'family', 'taskRoleArn', 'executionRoleArn', 'networkMode', 'containerDefinitions', 'volumes',
               'placementConstraints', 'requiresCompatibilities', 'cpu', 'memory', 'pidMode', 'ipcMode',
               'proxyConfiguration', 'inferenceAccelerators', 'ephemeralStorage', 'runtimePlatform',
               'enableFaultInjection'}
    payload = {k: v for k, v in definition.items() if k in allowed}
    with tempfile.NamedTemporaryFile(mode='w+', suffix='.json') as task_file:
        json.dump(payload, task_file)
        task_file.flush()
        registered = aws('ecs', 'register-task-definition', '--cli-input-json', f'file://{task_file.name}')['taskDefinition']['taskDefinitionArn']
    print(f'Deploying {registered}; previous revision: {previous}', flush=True)
    updated = False
    try:
        deployment = {key: value for key, value in current.get('deploymentConfiguration', {}).items()
                      if key in {'alarms', 'bakeTimeInMinutes'}}
        deployment.update(minimumHealthyPercent=100, maximumPercent=200,
                          deploymentCircuitBreaker={'enable': True, 'rollback': True})
        aws('ecs', 'update-service', '--cluster', cluster, '--service', service, '--task-definition', registered,
            '--deployment-configuration', json.dumps(deployment))
        updated = True
        deadline = time.monotonic() + 900
        while time.monotonic() < deadline:
            state = aws('ecs', 'describe-services', '--cluster', cluster, '--services', service)['services'][0]
            deployments = state['deployments']
            active = next((d for d in deployments if d.get('status') == 'PRIMARY'), {})
            if state['taskDefinition'] != registered:
                raise RuntimeError('ECS rolled back the requested revision')
            if active.get('rolloutState') == 'FAILED':
                raise RuntimeError('Requested deployment failed')
            if (len(deployments) == 1 and active.get('rolloutState') == 'COMPLETED'
                    and state['runningCount'] == state['desiredCount'] and state['pendingCount'] == 0):
                print(f'Deployment verified: {registered}', flush=True)
                return
            time.sleep(10)
        raise TimeoutError('ECS did not become stable within 15 minutes')
    except Exception:
        if updated:
            print(f'Restoring previous revision: {previous}', flush=True)
            aws('ecs', 'update-service', '--cluster', cluster, '--service', service, '--task-definition', previous)
            aws('ecs', 'wait', 'services-stable', '--cluster', cluster, '--services', service)
            restored = aws('ecs', 'describe-services', '--cluster', cluster, '--services', service)['services'][0]
            if restored['taskDefinition'] != previous:
                raise RuntimeError('Rollback did not restore the previous task definition')
            print(f'Rollback verified: {previous}', flush=True)
        raise


if __name__ == '__main__':
    try:
        deploy()
    except Exception as error:
        # AWS error output can contain task-definition values. Keep CI output bounded and secret-free.
        print(f'Deployment failed ({type(error).__name__}). Inspect ECS events and the incident runbook.')
        if isinstance(error, (RuntimeError, ValueError, TimeoutError, KeyError)):
            print(str(error))
        raise SystemExit(1)
