const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { configProblems, verifyDeploymentTarget } = require('../lib/deployment-preflight');
const { configPath } = require('../bin/preflight');

const config = {
  mode: 'managed', account: '222222222222', region: 'us-west-2', environment: 'production',
  availabilityZones: ['us-west-2a', 'us-west-2b'],
  certificateArn: 'arn:aws:acm:us-west-2:222222222222:certificate/12345678-1234-1234-1234-123456789012',
  runtimeSecretArn: 'arn:aws:secretsmanager:us-west-2:222222222222:secret:gradhunt-production-Qwe789',
  domainName: 'jobs.gradhunt.test', githubOidcSubject: 'repo:owner/gradhunt:environment:production',
};
const metadata = (overrides = {}) => {
  const values = {
    'sts get-caller-identity': { Account: config.account },
    'ec2 describe-availability-zones': { AvailabilityZones: config.availabilityZones.map(ZoneName => ({ ZoneName })) },
    'acm describe-certificate': { Certificate: { Status: 'ISSUED', DomainName: '*.gradhunt.test' } },
    'secretsmanager describe-secret': { ARN: config.runtimeSecretArn },
    'iam list-open-id-connect-providers': { OpenIDConnectProviderList: [] },
    ...overrides,
  };
  return args => {
    const key = args.slice(0, 2).join(' ');
    assert.ok(key in values, `Unexpected AWS operation: ${key}`);
    return values[key];
  };
};

test('deployment rejects example fixtures and all missing production prerequisites before AWS access', () => {
  for (const file of ['../config.example.json', '../config.managed.example.json']) {
    assert.ok(configProblems(require(file)).some(problem => problem.includes('Placeholder')));
  }
  let calls = 0;
  assert.throws(() => verifyDeploymentTarget({ ...config, certificateArn: null, runtimeSecretArn: null, domainName: null }, () => { calls++; }), error => {
    assert.match(error.message, /Missing certificateArn/);
    assert.match(error.message, /Missing runtimeSecretArn/);
    assert.match(error.message, /Missing domainName/);
    return true;
  });
  assert.equal(calls, 0);
});

test('deployment stops on an account mismatch before resource checks', () => {
  const calls = [];
  assert.throws(() => verifyDeploymentTarget(config, args => { calls.push(args); return { Account: '333333333333' }; }), /credentials target account/);
  assert.equal(calls.length, 1);
});

test('managed mode verifies real metadata and accepts an issued wildcard certificate', () => {
  assert.deepEqual(verifyDeploymentTarget(config, metadata()), {
    account: config.account, region: config.region, mode: 'managed', stack: 'GradHunt-production',
  });
});

test('deployment rejects cross-region ARNs, unavailable zones and unissued or mismatched certificates', () => {
  assert.throws(() => verifyDeploymentTarget({ ...config, certificateArn: config.certificateArn.replace('us-west-2', 'us-east-1') }, metadata()), /selected AWS account and region/);
  assert.throws(() => verifyDeploymentTarget({ ...config, availabilityZones: ['us-west-2a', 'us-west-2z'] }, metadata()), /distinct available zones/);
  assert.throws(() => verifyDeploymentTarget(config, metadata({ 'acm describe-certificate': { Certificate: { Status: 'PENDING_VALIDATION' } } })), /must be ISSUED/);
  assert.throws(() => verifyDeploymentTarget({ ...config, domainName: 'nested.jobs.gradhunt.test' }, metadata()), /does not cover/);
});

test('deployment rejects deleted secrets and duplicate OIDC provider creation', () => {
  assert.throws(() => verifyDeploymentTarget(config, metadata({ 'secretsmanager describe-secret': { ARN: config.runtimeSecretArn, DeletedDate: '2026-10-23' } })), /scheduled for deletion/);
  const Arn = 'arn:aws:iam::222222222222:oidc-provider/token.actions.githubusercontent.com';
  const aws = metadata({ 'iam list-open-id-connect-providers': { OpenIDConnectProviderList: [{ Arn }] } });
  assert.throws(() => verifyDeploymentTarget(config, aws), /avoid creating a duplicate/);
  assert.equal(verifyDeploymentTarget({ ...config, oidcProviderArn: Arn }, aws).mode, 'managed');
});

test('existing mode requires a real service whose family and roles match', () => {
  const existing = { ...config, mode: 'existing', clusterName: 'actual-cluster', serviceName: 'actual-service',
    taskFamily: 'actual-task', taskRoleArn: 'arn:aws:iam::222222222222:role/task', executionRoleArn: 'arn:aws:iam::222222222222:role/execution' };
  const service = { status: 'ACTIVE', taskDefinition: 'actual-task:1' };
  const taskDefinition = { family: existing.taskFamily, taskRoleArn: existing.taskRoleArn, executionRoleArn: existing.executionRoleArn };
  const overrides = { 'ecs describe-services': { services: [service] }, 'ecs describe-task-definition': { taskDefinition } };
  assert.equal(verifyDeploymentTarget(existing, metadata(overrides)).mode, 'existing');
  assert.throws(() => verifyDeploymentTarget(existing, metadata({ ...overrides, 'ecs describe-task-definition': { taskDefinition: { ...taskDefinition, family: 'unrelated' } } })), /must match/);
});

test('preflight and deploy reject ambiguous configuration arguments', () => {
  assert.equal(configPath(['-c', 'config=production.json']), configPath(['--config', 'production.json']));
  assert.throws(() => configPath(['-c', 'config=real.json', '-c', 'config=other.json']), /exactly one/);
});

test('AWS-provided HTTPS mode needs no domain or certificate and verifies the origin-facing prefix list', () => {
  const selected = { ...config, publicEndpoint: 'cloudfront', cloudFrontPrefixListId: 'pl-82a045eb' };
  delete selected.domainName;
  delete selected.certificateArn;
  const data = { PrefixLists: [{ OwnerId: 'AWS', PrefixListName: 'com.amazonaws.global.cloudfront.origin-facing' }] };
  const aws = metadata({ 'ec2 describe-managed-prefix-lists': data });
  assert.equal(verifyDeploymentTarget(selected, aws).mode, 'managed');
  assert.throws(() => verifyDeploymentTarget(selected, metadata({
    'ec2 describe-managed-prefix-lists': { PrefixLists: [{ OwnerId: '222222222222', PrefixListName: 'unrelated' }] },
  })), /AWS-managed CloudFront/);
});

test('deploy entrypoint rejects placeholders before invoking AWS or CDK', () => {
  const result = spawnSync(process.execPath, ['bin/deploy.js', '-c', 'config=config.managed.example.json'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { PATH: '', AWS_EC2_METADATA_DISABLED: 'true' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Deployment stopped before CDK provisioning/);
  assert.match(result.stderr, /Placeholder value/);
});
