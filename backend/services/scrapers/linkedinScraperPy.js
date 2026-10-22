const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const scrapeLinkedInJobsPy = async (role, location, numJobs = 50, signal) => {
  signal?.throwIfAborted();
  // Each invocation owns its result file; concurrent searches cannot overwrite it.
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'gradhunt-linkedin-'));
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.env.PYTHON_BIN || 'python3', [
        path.join(__dirname, 'linkedinScraper.py'), role, location, String(numJobs),
      ], { cwd, stdio: 'ignore', timeout: 110000, killSignal: 'SIGKILL', signal });
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error('LinkedIn scraper process failed')));
    });
    const jobs = JSON.parse(await fs.readFile(path.join(cwd, 'linkedin_jobs.json'), 'utf8'));
    return jobs.map(job => ({ ...job, location: job.location || location, created: new Date().toISOString() }));
  } finally { await fs.rm(cwd, { recursive: true, force: true }); }
};
module.exports = { scrapeLinkedInJobsPy };
