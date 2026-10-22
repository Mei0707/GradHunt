const { execFileSync } = require('node:child_process');
const { validateConfig } = require('./gradhunt-stack');

const awsMetadata = (args, region) => {
  try {
    return JSON.parse(execFileSync('aws', [...args, '--region', region, '--output', 'json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
    }));
  } catch (error) {
    const code = String(error.stderr || '').match(/An error occurred \(([^)]+)\)/)?.[1];
    throw new Error(`AWS ${args[0]} ${args[1]} metadata lookup failed${code ? ` (${code})` : ''}. Check the selected profile and read permissions.`);
  }
};

const configProblems = config => {
  const problems = [];
  const required = ['mode', 'account', 'region', 'environment', 'githubOidcSubject',
    ...(config.mode === 'managed' ? ['runtimeSecretArn', ...(config.publicEndpoint === 'cloudfront' ? ['cloudFrontPrefixListId'] : ['certificateArn', 'domainName'])]
      : ['clusterName', 'serviceName', 'taskFamily', 'taskRoleArn', 'executionRoleArn'])];
  for (const key of required) if (!config[key]) problems.push(`Missing ${key}`);
  if (config.account && !/^\d{12}$/.test(config.account)) problems.push('account must be a 12-digit AWS account ID');
  const inspect = (value, key) => {
    if (typeof value === 'string' && /YOUR_|111111111111|example\.com|00000000-0000-0000-0000-000000000000/i.test(value)) {
      problems.push(`Placeholder value in ${key}`);
    } else if (value && typeof value === 'object') {
      for (const [child, entry] of Object.entries(value)) inspect(entry, `${key}.${child}`);
    }
  };
  inspect(config, 'config');
  try { validateConfig(config); } catch (error) {
    if (!problems.includes(error.message)) problems.push(error.message);
  }
  return problems;
};

const arnMatches = (arn, service, account, region) => {
  const fields = String(arn).split(':');
  return fields[0] === 'arn' && fields[2] === service && fields[3] === region && fields[4] === account;
};
const coversDomain = (name, domain) => {
  if (typeof name !== 'string') return false;
  if (name === domain) return true;
  if (!name.startsWith('*.')) return false;
  const suffix = name.slice(1);
  return domain.endsWith(suffix) && !domain.slice(0, -suffix.length).includes('.');
};

// Read-only checks. Never retrieve secret values or create/update AWS resources.
const verifyDeploymentTarget = (config, aws = awsMetadata) => {
  const problems = configProblems(config);
  if (problems.length) throw new Error(problems.join('\n'));
  const lookup = args => aws(args, config.region);
  const identity = lookup(['sts', 'get-caller-identity']);
  if (identity.Account !== config.account) {
    throw new Error(`AWS credentials target account ${identity.Account}, but configuration targets ${config.account}`);
  }
  if (config.mode === 'managed') {
    const cloudFront = config.publicEndpoint === 'cloudfront';
    const arns = [['runtimeSecretArn', 'secretsmanager'], ...(!cloudFront ? [['certificateArn', 'acm']] : [])];
    for (const [key, service] of arns) {
      if (!arnMatches(config[key], service, config.account, config.region)) {
        throw new Error(`${key} must refer to the selected AWS account and region`);
      }
    }
    const available = lookup(['ec2', 'describe-availability-zones', '--filters', 'Name=state,Values=available', 'Name=zone-type,Values=availability-zone']);
    const names = new Set(available.AvailabilityZones.map(zone => zone.ZoneName));
    const selected = config.availabilityZones || config.vpc?.availabilityZones || [];
    if (new Set(selected).size < 2 || selected.some(zone => !names.has(zone))) {
      throw new Error('Select at least two distinct available zones in the target region');
    }
    if (cloudFront) {
      const { PrefixLists: lists } = lookup(['ec2', 'describe-managed-prefix-lists', '--prefix-list-ids', config.cloudFrontPrefixListId]);
      if (lists.length !== 1 || lists[0].OwnerId !== 'AWS' || lists[0].PrefixListName !== 'com.amazonaws.global.cloudfront.origin-facing') {
        throw new Error('cloudFrontPrefixListId must be the regional AWS-managed CloudFront origin-facing prefix list');
      }
    } else {
      const { Certificate: certificate } = lookup(['acm', 'describe-certificate', '--certificate-arn', config.certificateArn]);
      if (certificate.Status !== 'ISSUED') throw new Error('The ACM certificate must be ISSUED before deployment');
      if (![certificate.DomainName, ...(certificate.SubjectAlternativeNames || [])].some(name => coversDomain(name, config.domainName))) {
        throw new Error('The ACM certificate does not cover domainName');
      }
    }
    const secret = lookup(['secretsmanager', 'describe-secret', '--secret-id', config.runtimeSecretArn]);
    if (secret.ARN !== config.runtimeSecretArn || secret.DeletedDate) throw new Error('The runtime secret must exist and must not be scheduled for deletion');
    if (Boolean(config.hostedZoneId) !== Boolean(config.hostedZoneName)) {
      throw new Error('Set hostedZoneId and hostedZoneName together, or configure DNS externally');
    }
    if (config.hostedZoneId) {
      const { HostedZone: zone } = lookup(['route53', 'get-hosted-zone', '--id', config.hostedZoneId]);
      const zoneName = zone.Name.replace(/\.$/, '');
      if (zone.Config.PrivateZone || zoneName !== config.hostedZoneName.replace(/\.$/, '')
          || (config.domainName !== zoneName && !config.domainName.endsWith(`.${zoneName}`))) {
        throw new Error('The hosted zone must be public and match the selected domain');
      }
    }
  } else {
    const result = lookup(['ecs', 'describe-services', '--cluster', config.clusterName, '--services', config.serviceName]);
    if (result.failures?.length || result.services?.length !== 1 || result.services[0].status !== 'ACTIVE') {
      throw new Error('The existing ECS service must be verified and ACTIVE');
    }
    const { taskDefinition: task } = lookup(['ecs', 'describe-task-definition', '--task-definition', result.services[0].taskDefinition]);
    if (task.family !== config.taskFamily || task.taskRoleArn !== config.taskRoleArn || task.executionRoleArn !== config.executionRoleArn) {
      throw new Error('Existing service task family and role ARNs must match the configuration');
    }
  }
  const { OpenIDConnectProviderList: providers } = lookup(['iam', 'list-open-id-connect-providers']);
  const github = providers.find(provider => provider.Arn.endsWith('/token.actions.githubusercontent.com'));
  if (github && config.oidcProviderArn !== github.Arn) {
    throw new Error('Set oidcProviderArn to the existing GitHub OIDC provider to avoid creating a duplicate');
  }
  if (config.oidcProviderArn && config.oidcProviderArn !== github?.Arn) {
    throw new Error('Configured GitHub OIDC provider was not found in the selected account');
  }
  return { account: config.account, region: config.region, mode: config.mode, stack: `GradHunt-${config.environment}` };
};

module.exports = { configProblems, verifyDeploymentTarget };
