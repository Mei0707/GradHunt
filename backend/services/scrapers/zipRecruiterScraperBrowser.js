const { chromium } = require('playwright');

const DEFAULT_TIMEOUT_MS = 30000;
const PAGE_SIZE = 20;
const ZIP_BASE_URL = 'https://www.ziprecruiter.com';

const compactText = (value) => value?.replace(/\s+/g, ' ').trim() || null;

const normalizeDescription = (value) => {
  const text = compactText(value);
  if (!text) {
    return 'No description available';
  }

  return text.length > 320 ? `${text.slice(0, 320)}...` : text;
};

const extractJobsFromPage = async (page, location) =>
  page.evaluate((fallbackLocation) => {
    const cleanText = (value) => value?.replace(/\s+/g, ' ').trim() || null;

    const normalizeDescription = (value) => {
      const text = cleanText(value);
      if (!text) {
        return 'No description available';
      }

      return text.length > 320 ? `${text.slice(0, 320)}...` : text;
    };

    const getText = (root, selectors) => {
      for (const selector of selectors) {
        if (root.matches?.(selector) && root.textContent?.trim()) {
          return root.textContent.trim();
        }

        const element = root.querySelector?.(selector);
        if (element?.textContent?.trim()) {
          return element.textContent.trim();
        }
      }

      return null;
    };

    const buildFallbackDescription = (card, ignoredValues = []) => {
      const ignored = new Set(
        ignoredValues
          .filter(Boolean)
          .map((value) => value.replace(/\s+/g, ' ').trim().toLowerCase())
      );

      const lines = (card.innerText || '')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .filter((line) => {
          const normalized = line.toLowerCase();
          if (!normalized || ignored.has(normalized)) {
            return false;
          }

          if (/^\$[\d,]/.test(line) || /^salary/i.test(line) || /^pay/i.test(line)) {
            return false;
          }

          if (/^\d+\s+days? ago$/i.test(line) || /^today$/i.test(line) || /^just posted$/i.test(line)) {
            return false;
          }

          return true;
        });

      if (lines.length === 0) {
        return null;
      }

      return lines.slice(0, 2).join(' ');
    };

    const links = Array.from(document.querySelectorAll([
      'a[href*="/jobs/"]',
      'a[href*="/c/job/"]',
      'a[href*="/job/"]',
      'a[data-testid*="job"]',
      'a[class*="job"]',
    ].join(', ')));
    const seenUrls = new Set();
    const jobs = [];

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) {
        continue;
      }

      let absoluteUrl;
      try {
        absoluteUrl = new URL(href, 'https://www.ziprecruiter.com').toString();
      } catch {
        continue;
      }

      if (seenUrls.has(absoluteUrl)) {
        continue;
      }

      const card =
        link.closest('article, li, tr, div[data-testid*="job"], div[class*="job"], div[class*="card"], section') ||
        link.closest('div') ||
        link;

      const title =
        getText(card, ['h2', 'h3', '[data-testid="job_title"]']) ||
        getText(link, ['h2', 'h3', '[data-testid="job_title"]']) ||
        link.textContent?.replace(/\s+/g, ' ').trim() ||
        'Unknown Title';

      if (title === 'Unknown Title') {
        continue;
      }

      const company =
        getText(card, [
          '[data-testid="job_company_name"]',
          '[data-testid="company_name"]',
          'a[href*="/co/"]',
          'span[class*="company"]',
          'div[class*="company"]',
        ]) || 'Unknown Company';

      const jobLocation =
        getText(card, [
          '[data-testid="job_location"]',
          '[data-testid="location"]',
          'span[class*="location"]',
          'div[class*="location"]',
        ]) || fallbackLocation;

      const salary =
        getText(card, [
          '[data-testid="job_salary"]',
          'span[class*="salary"]',
          'div[class*="salary"]',
        ]) || 'Salary not specified';

      const timePosted =
        getText(card, [
          '[data-testid="job_age"]',
          'time',
          'span[class*="posted"]',
          'span[class*="date"]',
        ]) || 'Recently';

      const description =
        getText(card, [
          '[data-testid="job_description"]',
          'p',
          'div[class*="description"]',
          'div[class*="snippet"]',
          'span[class*="description"]',
        ]) ||
        buildFallbackDescription(card, [title, company, jobLocation, salary, timePosted]) ||
        'No description available';

      jobs.push({
        id: `ziprecruiter-${absoluteUrl.split('/').filter(Boolean).pop() || jobs.length}`,
        title,
        company,
        location: jobLocation,
        description: normalizeDescription(description),
        salary,
        url: absoluteUrl,
        time_posted: timePosted,
        source: 'ZipRecruiter',
      });

      seenUrls.add(absoluteUrl);
    }

    return jobs;
  }, location);

const scrapeZipRecruiterJobsBrowser = async (title, location, numJobs = 20) => {
  let browser;
  const allJobs = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1440, height: 1200 },
      extraHTTPHeaders: {
        'accept-language': 'en-US,en;q=0.9',
        referer: ZIP_BASE_URL,
        'upgrade-insecure-requests': '1',
      },
    });

    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3],
      });
    });

    await page.goto(ZIP_BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => null);
    await page.waitForTimeout(1200);

    let pageIndex = 1;

    while (allJobs.length < numJobs) {
      const pageUrl = `${ZIP_BASE_URL}/jobs-search?search=${encodeURIComponent(title)}&location=${encodeURIComponent(location)}&page=${pageIndex}`;
      console.log(`Loading ZipRecruiter page ${pageIndex}: ${pageUrl}`);

      const response = await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
      const status = response?.status();
      console.log(`ZipRecruiter response status: ${status}`);

      if (!response || status >= 400) {
        if (allJobs.length > 0) {
          console.warn(`ZipRecruiter blocked page ${pageIndex} with status ${status}. Returning ${allJobs.length} jobs collected so far.`);
          break;
        }

        const pageSignals = await page.evaluate(() => ({
          title: document.title,
          hasChallengeText: /access denied|forbidden|verify|unusual traffic|security/i.test(document.body?.innerText || ''),
          bodyPreview: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 220),
        })).catch(() => null);

        console.warn(`ZipRecruiter blocked the initial search page with status ${status}.`, pageSignals);
        return [];
      }

      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1200);

      const jobsOnPage = await extractJobsFromPage(page, location);
      console.log(`ZipRecruiter scraper found ${jobsOnPage.length} jobs on page ${pageIndex}`);

      if (jobsOnPage.length === 0) {
        const pageSignals = await page.evaluate(() => ({
          title: document.title,
          bodyPreview: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 260),
          linkCount: document.querySelectorAll('a').length,
          jobLikeLinkCount: document.querySelectorAll('a[href*="/jobs/"], a[href*="/job/"], a[data-testid*="job"], a[class*="job"]').length,
        })).catch(() => null);

        console.warn(`ZipRecruiter returned 0 parsed jobs on page ${pageIndex}.`, pageSignals);
        break;
      }

      for (const job of jobsOnPage) {
        if (!allJobs.some((existingJob) => existingJob.url === job.url)) {
          allJobs.push({
            ...job,
            created: new Date().toISOString(),
          });
        }

        if (allJobs.length >= numJobs) {
          break;
        }
      }

      if (jobsOnPage.length < PAGE_SIZE) {
        break;
      }

      pageIndex += 1;
    }

    return allJobs.slice(0, numJobs);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

module.exports = {
  scrapeZipRecruiterJobsBrowser,
};
