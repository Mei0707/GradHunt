const cdk = require('aws-cdk-lib');
const fs = require('node:fs');
const path = require('node:path');
const { GradHuntStack } = require('../lib/gradhunt-stack');
const app = new cdk.App();
const file = app.node.tryGetContext('config');
if (!file) throw new Error('Supply -c config=./config.json; see config.example.json');
const config = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const zones = config.availabilityZones || config.vpc?.availabilityZones;
if (zones && config.account && config.region) {
  // Explicit deployment AZs also satisfy constructs that request Stack availability zones.
  app.node.setContext(`availability-zones:account=${config.account}:region=${config.region}`, zones);
}
new GradHuntStack(app, `GradHunt-${config.environment}`, { config,
  env: { account: config.account || process.env.CDK_DEFAULT_ACCOUNT, region: config.region || process.env.CDK_DEFAULT_REGION } });
