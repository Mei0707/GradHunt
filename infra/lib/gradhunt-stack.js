const cdk = require('aws-cdk-lib');
const { aws_cloudwatch: cw, aws_cloudwatch_actions: actions, aws_ec2: ec2,
  aws_ecs: ecs, aws_ecr: ecr, aws_iam: iam, aws_logs: logs,
  aws_sns: sns, aws_sns_subscriptions: subscriptions, aws_events: events,
  aws_events_targets: targets, aws_secretsmanager: secrets,
  aws_s3: s3,
  aws_certificatemanager: acm, aws_elasticloadbalancingv2: elb,
  aws_route53: route53, aws_route53_targets: dns } = cdk;
const path = require('node:path');

function validateConfig(config) {
  if (!['existing', 'managed'].includes(config.mode)) throw new Error('mode must be existing or managed');
  for (const key of ['environment', 'githubOidcSubject']) {
    if (!config[key] || typeof config[key] !== 'string') throw new Error(`Missing ${key}`);
  }
  if (!/^[a-z][a-z0-9-]{0,24}$/.test(config.environment)) throw new Error('Invalid environment');
  if (config.githubOidcSubject.includes('*') || !config.githubOidcSubject.endsWith(`:environment:${config.environment}`)) {
    throw new Error('GitHub OIDC subject must match one exact protected environment');
  }
  const required = config.mode === 'existing'
    ? ['clusterName', 'serviceName', 'taskFamily', 'taskRoleArn', 'executionRoleArn']
    : ['runtimeSecretArn', 'certificateArn', 'domainName'];
  for (const key of required) if (!config[key]) throw new Error(`Missing ${key}`);
  if (config.mode === 'managed' && !config.vpc && (!Array.isArray(config.availabilityZones) || config.availabilityZones.length < 2)) {
    throw new Error('Managed mode requires at least two explicit availabilityZones or imported VPC attributes');
  }
}

class GradHuntStack extends cdk.Stack {
  constructor(scope, id, props) {
    const { config, ...stackProps } = props;
    super(scope, id, stackProps);
    validateConfig(config);
    const stage = config.environment;
    cdk.Tags.of(this).add('Project', 'GradHunt');
    cdk.Tags.of(this).add('Environment', stage);
    const topic = new sns.Topic(this, 'Alerts', { enforceSSL: true });
    if (config.alertEmail) topic.addSubscription(new subscriptions.EmailSubscription(config.alertEmail));
    const logGroup = new logs.LogGroup(this, 'GatewayLogs', {
      logGroupName: `/gradhunt/${stage}/gateway`, retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const repository = new ecr.Repository(this, 'Images', {
      imageScanOnPush: true, imageTagMutability: ecr.TagMutability.IMMUTABLE,
      encryption: ecr.RepositoryEncryption.AES_256, removalPolicy: cdk.RemovalPolicy.RETAIN,
      emptyOnDelete: false,
    });
    const uploads = config.resumeBucketName
      ? s3.Bucket.fromBucketName(this, 'Uploads', config.resumeBucketName)
      : new s3.Bucket(this, 'Uploads', {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true,
        encryption: s3.BucketEncryption.S3_MANAGED, removalPolicy: cdk.RemovalPolicy.RETAIN,
        versioned: true, lifecycleRules: [{ prefix: 'resumes/',
          expiration: cdk.Duration.days(30), noncurrentVersionExpiration: cdk.Duration.days(7),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) }],
      });
    let clusterName, serviceName, serviceArn, taskFamily, taskRoleArn, executionRoleArn;
    let taskRole;
    let service, targetGroup, loadBalancer;
    if (config.mode === 'managed') {
      const vpc = config.vpc ? ec2.Vpc.fromVpcAttributes(this, 'Vpc', config.vpc) : new ec2.Vpc(this, 'Vpc', {
        availabilityZones: config.availabilityZones, natGateways: 1,
        subnetConfiguration: [
          { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
          { name: 'application', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        ],
      });
      const cluster = new ecs.Cluster(this, 'Cluster', { vpc, containerInsightsV2: ecs.ContainerInsights.ENABLED });
      const runtime = secrets.Secret.fromSecretCompleteArn(this, 'Runtime', config.runtimeSecretArn);
      const definition = new ecs.FargateTaskDefinition(this, 'Task', {
        family: `gradhunt-${stage}`, cpu: 1024, memoryLimitMiB: 2048,
      });
      const gatewaySecrets = {};
      for (const key of ['MONGODB_URI', 'AUTH_SECRET', 'OPENAI_API_KEY', 'RESEND_API_KEY', 'EMAIL_FROM']) {
        gatewaySecrets[key] = ecs.Secret.fromSecretsManager(runtime, key);
      }
      if (config.agentServiceUrl) gatewaySecrets.AGENT_SERVICE_TOKEN = ecs.Secret.fromSecretsManager(runtime, 'AGENT_SERVICE_TOKEN');
      const gateway = definition.addContainer('gateway', {
        image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../..')),
        logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: 'gateway' }),
        environment: { NODE_ENV: 'production', ENVIRONMENT: stage, CLOUDWATCH_EMF: 'true',
          TRUST_PROXY: 'true', FRONTEND_URL: `https://${config.domainName}`, RESUME_BUCKET: uploads.bucketName,
          ...(config.agentServiceUrl ? { AGENT_SERVICE_URL: config.agentServiceUrl } : {}) },
        secrets: gatewaySecrets, stopTimeout: cdk.Duration.seconds(30),
        healthCheck: { command: ['CMD-SHELL', `node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`],
          interval: cdk.Duration.seconds(30), timeout: cdk.Duration.seconds(5), retries: 3, startPeriod: cdk.Duration.seconds(30) },
      });
      gateway.addPortMappings({ containerPort: 3000 });
      repository.grantPull(definition.executionRole);
      service = new ecs.FargateService(this, 'Service', {
        cluster, taskDefinition: definition, desiredCount: 2, assignPublicIp: false,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        circuitBreaker: { rollback: true }, minHealthyPercent: 100, maxHealthyPercent: 200,
        healthCheckGracePeriod: cdk.Duration.seconds(60),
      });
      loadBalancer = new elb.ApplicationLoadBalancer(this, 'LoadBalancer', {
        vpc, internetFacing: true, dropInvalidHeaderFields: true, idleTimeout: cdk.Duration.seconds(150),
      });
      loadBalancer.addRedirect({ sourcePort: 80, targetPort: 443, targetProtocol: elb.ApplicationProtocol.HTTPS });
      const listener = loadBalancer.addListener('Https', { port: 443,
        certificates: [acm.Certificate.fromCertificateArn(this, 'Certificate', config.certificateArn)],
        sslPolicy: elb.SslPolicy.RECOMMENDED_TLS });
      targetGroup = listener.addTargets('Gateway', {
        port: 3000, protocol: elb.ApplicationProtocol.HTTP, targets: [service],
        healthCheck: { path: '/api/health/ready', healthyHttpCodes: '200',
          interval: cdk.Duration.seconds(30), timeout: cdk.Duration.seconds(5) },
        deregistrationDelay: cdk.Duration.seconds(30),
      });
      const scaling = service.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 4 });
      scaling.scaleOnCpuUtilization('CpuScaling', { targetUtilizationPercent: 60,
        scaleInCooldown: cdk.Duration.minutes(5), scaleOutCooldown: cdk.Duration.minutes(1) });
      if (config.hostedZoneId && config.hostedZoneName) {
        const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
          hostedZoneId: config.hostedZoneId, zoneName: config.hostedZoneName,
        });
        new route53.ARecord(this, 'Dns', { zone, recordName: config.domainName,
          target: route53.RecordTarget.fromAlias(new dns.LoadBalancerTarget(loadBalancer)) });
      }
      clusterName = cluster.clusterName; serviceName = service.serviceName; serviceArn = service.serviceArn;
      taskFamily = definition.family; taskRoleArn = definition.taskRole.roleArn;
      taskRole = definition.taskRole;
      executionRoleArn = definition.executionRole.roleArn;
      new cdk.CfnOutput(this, 'ApplicationUrl', { value: `https://${config.domainName}` });
      new cdk.CfnOutput(this, 'LoadBalancerDns', { value: loadBalancer.loadBalancerDnsName });
    } else {
      ({ clusterName, serviceName, taskFamily, taskRoleArn, executionRoleArn } = config);
      taskRole = iam.Role.fromRoleArn(this, 'TaskRole', taskRoleArn);
      serviceArn = this.formatArn({ service: 'ecs', resource: 'service', resourceName: `${clusterName}/${serviceName}` });
      // Add narrowly scoped logging permissions to the existing task execution role.
      const executionRole = iam.Role.fromRoleArn(this, 'ExecutionRole', executionRoleArn);
      logGroup.grantWrite(executionRole);
      repository.grantPull(executionRole);
    }
    taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject'], resources: [uploads.arnForObjects('resumes/*')],
    }));

    const dimensionsMap = { Service: 'gateway', Environment: stage };
    const metric = (name, statistic = 'Sum', unit = cw.Unit.COUNT) => new cw.Metric({
      namespace: 'GradHunt', metricName: name, dimensionsMap, statistic, unit, period: cdk.Duration.minutes(1),
    });
    const requests = metric('Requests');
    const errors = metric('ServerErrors');
    const errorRate = new cw.MathExpression({ expression: 'IF(requests >= 20, 100 * errors / requests, 0)',
      usingMetrics: { requests, errors }, period: cdk.Duration.minutes(1), label: 'API 5xx % (min 20 requests)' });
    const availability = new cw.MathExpression({ expression: 'IF(requests > 0, 100 * (1 - (errors + aborts) / requests))',
      usingMetrics: { requests, errors, aborts: metric('AbortedRequests') }, period: cdk.Duration.minutes(1), label: 'API success %' });
    const latency = metric('Latency', 'p95', cw.Unit.MILLISECONDS);
    const alarms = [];
    const alarm = (name, signal, threshold, evaluationPeriods = 3, missing = cw.TreatMissingData.NOT_BREACHING, comparisonOperator) => {
      const result = new cw.Alarm(this, name, { metric: signal, threshold, evaluationPeriods,
        alarmName: `GradHunt-${stage}-${name}`,
        datapointsToAlarm: evaluationPeriods, treatMissingData: missing,
        comparisonOperator: comparisonOperator || cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        alarmDescription: `${name}. See docs/runbooks/incident-response.md in GradHunt.` });
      result.addAlarmAction(new actions.SnsAction(topic));
      result.addOkAction(new actions.SnsAction(topic));
      alarms.push(result);
      return result;
    };
    const errorAlarm = alarm('HighApiErrorRate', errorRate, 5);
    if (service) {
      service.enableDeploymentAlarms([`GradHunt-${stage}-HighApiErrorRate`], {
        behavior: ecs.AlarmBehavior.ROLLBACK_ON_ALARM,
      });
      service.node.addDependency(errorAlarm);
    }
    alarm('HighApiLatency', latency, 120000, 3);
    alarm('DatabaseUnavailable', metric('DatabaseAvailable', 'Minimum'), 1, 2,
      cw.TreatMissingData.BREACHING, cw.ComparisonOperator.LESS_THAN_THRESHOLD);
    alarm('AbortedRequests', metric('AbortedRequests'), 5);
    const cpu = new cw.Metric({ namespace: 'AWS/ECS', metricName: 'CPUUtilization',
      dimensionsMap: { ClusterName: clusterName, ServiceName: serviceName }, statistic: 'Average', period: cdk.Duration.minutes(1) });
    const memory = cpu.with({ metricName: 'MemoryUtilization' });
    alarm('HighCpu', cpu, 85, 5);
    alarm('HighMemory', memory, 85, 5);
    const lbName = loadBalancer?.loadBalancerFullName || config.loadBalancerFullName;
    const tgName = targetGroup?.targetGroupFullName || config.targetGroupFullName;
    const extraMetrics = [];
    if (lbName && tgName) {
      const unhealthy = new cw.Metric({ namespace: 'AWS/ApplicationELB', metricName: 'UnHealthyHostCount',
        dimensionsMap: { LoadBalancer: lbName, TargetGroup: tgName }, statistic: 'Maximum', period: cdk.Duration.minutes(1) });
      alarm('UnhealthyTargets', unhealthy, 1, 2);
      const lbErrors = new cw.Metric({ namespace: 'AWS/ApplicationELB', metricName: 'HTTPCode_ELB_5XX_Count',
        dimensionsMap: { LoadBalancer: lbName }, statistic: 'Sum', period: cdk.Duration.minutes(1) });
      alarm('LoadBalancerErrors', lbErrors, 5, 2);
      extraMetrics.push(unhealthy, lbErrors);
    }
    for (const dependency of ['linkedin', 'indeed', 'ziprecruiter', 'agent']) {
      const failure = new cw.Metric({ namespace: 'GradHunt', metricName: dependency === 'agent' ? 'DependencyFailures' : 'ScraperFailures',
        dimensionsMap: { ...dimensionsMap, Dependency: dependency }, statistic: 'Sum', period: cdk.Duration.minutes(5) });
      alarm(`${dependency}Failures`, failure, 3, 1);
    }
    const failureRule = new events.Rule(this, 'DeploymentFailed', { eventPattern: {
      source: ['aws.ecs'], detailType: ['ECS Deployment State Change'], resources: [serviceArn],
      detail: { eventName: ['SERVICE_DEPLOYMENT_FAILED'] },
    } });
    failureRule.addTarget(new targets.SnsTopic(topic));
    const dashboard = new cw.Dashboard(this, 'Dashboard', { dashboardName: `GradHunt-${stage}` });
    dashboard.addWidgets(
      new cw.GraphWidget({ title: 'API traffic and server errors', left: [requests, errors] }),
      new cw.GraphWidget({ title: 'API success (health checks excluded)', left: [availability] }),
      new cw.GraphWidget({ title: 'API p95 latency (includes scraping and AI)', left: [latency] }),
      new cw.GraphWidget({ title: 'ECS resource pressure', left: [cpu, memory] }),
      new cw.GraphWidget({ title: 'Database readiness', left: [metric('DatabaseAvailable', 'Minimum')] }),
      new cw.AlarmStatusWidget({ title: 'Service alarms', alarms, width: 24 }),
      new cw.LogQueryWidget({ title: 'Recent failed requests', logGroupNames: [logGroup.logGroupName],
        queryLines: ['fields @timestamp, requestId, route, status, durationMs', 'filter event = "http_request" and status >= 500', 'sort @timestamp desc', 'limit 30'] }),
    );
    if (extraMetrics.length) dashboard.addWidgets(new cw.GraphWidget({ title: 'Load balancer health', left: extraMetrics }));

    const provider = config.oidcProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GithubOidc', config.oidcProviderArn)
      : new iam.OpenIdConnectProvider(this, 'GithubOidc', {
        url: 'https://token.actions.githubusercontent.com', clientIds: ['sts.amazonaws.com'],
      });
    const deployRole = new iam.Role(this, 'DeployRole', {
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, { StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': config.githubOidcSubject,
      } }), maxSessionDuration: cdk.Duration.hours(1),
    });
    repository.grantPullPush(deployRole);
    repository.grant(deployRole, 'ecr:DescribeImages');
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['ecs:DescribeServices', 'ecs:UpdateService'], resources: [serviceArn] }));
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['ecs:DescribeTaskDefinition'],
      resources: [this.formatArn({ service: 'ecs', resource: 'task-definition', resourceName: `${taskFamily}:*`, arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME })] }));
    // RegisterTaskDefinition has no resource-level IAM support. PassRole is still scoped below.
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['ecs:RegisterTaskDefinition'], resources: ['*'] }));
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['iam:PassRole'], resources: [taskRoleArn, executionRoleArn],
      conditions: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } } }));
    for (const [key, value] of Object.entries({ RepositoryUri: repository.repositoryUri, ClusterName: clusterName,
      ServiceName: serviceName, TaskFamily: taskFamily, DeployRoleArn: deployRole.roleArn,
      LogGroupName: logGroup.logGroupName, ResumeBucketName: uploads.bucketName,
      AlertTopicArn: topic.topicArn })) new cdk.CfnOutput(this, key, { value });
  }
}
module.exports = { GradHuntStack, validateConfig };
