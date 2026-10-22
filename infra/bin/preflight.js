const fs = require('node:fs');
const path = require('node:path');
const { verifyDeploymentTarget } = require('../lib/deployment-preflight');

const configPath = args => {
  const files = [];
  args.forEach((argument, index) => {
    if (argument === '--config') files.push(args[index + 1]);
    if (argument === '-c' || argument === '--context') {
      if (args[index + 1]?.startsWith('config=')) files.push(args[index + 1].slice(7));
    }
    if (argument.startsWith('--context=config=')) files.push(argument.slice('--context=config='.length));
  });
  if (files.length !== 1 || !files[0]) throw new Error('Supply exactly one --config FILE or -c config=FILE');
  return path.resolve(files[0]);
};

const run = args => {
  const file = configPath(args);
  const target = verifyDeploymentTarget(JSON.parse(fs.readFileSync(file, 'utf8')));
  console.log(`Verified metadata for ${target.stack}: ${target.mode} mode, account ${target.account}, region ${target.region}. No resources changed.`);
  return target;
};
if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (error) { console.error(`Deployment preflight failed:\n${error.message}`); process.exitCode = 1; }
}
module.exports = { configPath, run };
