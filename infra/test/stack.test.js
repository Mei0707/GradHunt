const test = require('node:test');
const assert = require('node:assert/strict');
const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');
const { GradHuntStack, validateConfig } = require('../lib/gradhunt-stack');
const existing = require('../config.example.json');
const managed = require('../config.managed.example.json');
const synth = config => Template.fromStack(new GradHuntStack(new cdk.App(), 'Test', {
  config, env: { account: config.account, region: config.region },
}));

test('existing mode adds monitoring without creating replacement compute or network', () => {
  const template = synth(existing);
  template.resourceCountIs('AWS::ECS::Service', 0);
  template.resourceCountIs('AWS::EC2::VPC', 0);
  template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    Namespace: 'GradHunt', MetricName: 'DatabaseAvailable', TreatMissingData: 'breaching',
    Dimensions: Match.arrayWith([{ Name: 'Environment', Value: 'production' }, { Name: 'Service', Value: 'gateway' }]),
  });
  template.hasResourceProperties('AWS::Events::Rule', { EventPattern: {
    source: ['aws.ecs'], 'detail-type': ['ECS Deployment State Change'],
    detail: { eventName: ['SERVICE_DEPLOYMENT_FAILED'] }, resources: Match.anyValue(),
  } });
  template.hasResourceProperties('AWS::ECR::Repository', { ImageTagMutability: 'IMMUTABLE', ImageScanningConfiguration: { ScanOnPush: true } });
  assert.ok(JSON.stringify(template.toJSON()).includes('task-definition/YOUR_EXISTING_TASK_FAMILY:*'));
});

test('OIDC trust is limited to one environment and deploy policy scopes PassRole', () => {
  const template = synth(existing);
  template.hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: Match.arrayWith([Match.objectLike({
      Action: 'sts:AssumeRoleWithWebIdentity', Condition: { StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': existing.githubOidcSubject,
      } },
    })]) },
  });
  template.hasResourceProperties('AWS::IAM::Policy', { PolicyDocument: Match.objectLike({
    Statement: Match.arrayWith([Match.objectLike({ Action: 'iam:PassRole',
      Resource: [existing.taskRoleArn, existing.executionRoleArn],
      Condition: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
    })]),
  }) });
});

test('managed stack deploys private redundant tasks, HTTPS, health checks and rollback', () => {
  const template = synth(managed);
  template.hasResourceProperties('AWS::ECS::Service', {
    DesiredCount: 2, DeploymentConfiguration: Match.objectLike({
      DeploymentCircuitBreaker: { Enable: true, Rollback: true }, MinimumHealthyPercent: 100,
    }), NetworkConfiguration: { AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: 'DISABLED' }) },
  });
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', { Port: 443, Protocol: 'HTTPS' });
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', { HealthCheckPath: '/api/health/ready' });
  template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  template.hasResourceProperties('AWS::ECS::TaskDefinition', { ContainerDefinitions: Match.arrayWith([Match.objectLike({
    Name: 'gateway', Secrets: Match.arrayWith([Match.objectLike({ Name: 'AUTH_SECRET' })]),
  })]) });
  const roles = Object.values(template.findResources('AWS::IAM::Role'));
  const taskRole = roles.find(r => JSON.stringify(r.Properties.AssumeRolePolicyDocument).includes('ecs-tasks.amazonaws.com') && !r.Properties.ManagedPolicyArns);
  assert.ok(taskRole);
});

test('reject unsafe or incomplete config', () => {
  assert.throws(() => validateConfig({ ...existing, githubOidcSubject: 'repo:*' }), /exact protected/);
  assert.throws(() => validateConfig({ ...existing, taskRoleArn: '' }), /taskRoleArn/);
  assert.throws(() => validateConfig({ ...managed, certificateArn: '' }), /certificateArn/);
});
