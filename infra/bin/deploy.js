const { spawnSync } = require('node:child_process');
const { configPath, run } = require('./preflight');
try {
  const args = process.argv.slice(2);
  // Keep the checked configuration and CDK's configuration argument identical.
  configPath(args);
  if (args.includes('--config')) throw new Error('Use -c config=FILE with npm run deploy');
  run(args);
  const result = spawnSync(process.execPath, [require.resolve('aws-cdk/bin/cdk'), 'deploy', ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(`Deployment stopped before CDK provisioning:\n${error.message}`);
  process.exitCode = 1;
}
