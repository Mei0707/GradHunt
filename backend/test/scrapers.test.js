const test = require('node:test');
const assert = require('node:assert/strict');

const load = (t, implementations) => {
  const modules = [
    ['../services/scrapers/linkedinScraperPy', 'scrapeLinkedInJobsPy'],
    ['../services/scrapers/indeedScraperBrowser', 'scrapeIndeedJobsBrowser'],
    ['../services/scrapers/zipRecruiterScraperBrowser', 'scrapeZipRecruiterJobsBrowser'],
  ];
  modules.forEach(([name, method], i) => t.mock.method(require(name), method, implementations[i]));
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const entry = require.resolve('../services/scrapers/companyScrapers');
  delete require.cache[entry];
  return require(entry).scrapeAllCompanyJobs;
};
const down = async () => { throw new Error('provider down'); };

test('provider failure preserves results from another source', async t => {
  const job = { id: '1', title: 'Designer', company: 'Example', url: 'https://example.com/1' };
  const aggregate = load(t, [down, async () => [job], down]);
  assert.deepEqual(await aggregate('designer', 'New York'), [job]);
});

test('all provider failures reject with 503 instead of empty success', async t => {
  const aggregate = load(t, [down, down, down]);
  await assert.rejects(aggregate('designer', 'New York'), { statusCode: 503 });
});

test('a genuine successful empty source remains a valid empty result', async t => {
  const aggregate = load(t, [down, async () => [], down]);
  assert.deepEqual(await aggregate('designer', 'New York'), []);
});

test('provider deadlines abort underlying work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const hanging = (_role, _location, _count, signal) => new Promise((resolve, reject) => {
    signals.push(signal);
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const aggregate = load(t, [hanging, hanging, hanging]);
  const result = aggregate('designer', 'New York');
  const rejected = assert.rejects(result, { statusCode: 503 });
  t.mock.timers.tick(120001);
  await rejected;
  assert.equal(signals.length, 3);
  assert.ok(signals.every(signal => signal.aborted));
});
