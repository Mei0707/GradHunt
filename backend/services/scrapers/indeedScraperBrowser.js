const { chromium } = require('playwright');

const DEFAULT_TIMEOUT_MS = 30000;

const compactText = (value) => value?.replace(/\s+/g, ' ').trim() || null;

const normalizeDescription = (value) => {
  const text = compactText(value);
  if (!text) {
    return 'No description available';
  }

  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
};

const extractJobsFromPage = async (page, location) => {
  return page.evaluate((fallbackLocation) => {
    const normalizeDescription = (value) => {
      const text = value?.replace(/\s+/g, ' ').trim();
      if (!text) {
        return 'No description available';
      }

      return text.length > 300 ? `${text.slice(0, 300)}...` : text;
    };

    const cards = Array.from(document.querySelectorAll('div.job_seen_beacon, div.jobsearch-ResultsList > div.cardOutline'));

    return cards.map((card, index) => {
      const text = (selectorList) => {
        for (const selector of selectorList) {
          const element = card.querySelector(selector);
          if (element?.textContent?.trim()) {
            return element.textContent.trim();
          }
        }
        return null;
      };

      const link = card.querySelector('h2.jobTitle a, h2 a');
      const relativeUrl = link?.getAttribute('href');
      const url = relativeUrl
        ? new URL(relativeUrl, 'https://www.indeed.com').toString()
        : '#';

      const idMatch = relativeUrl?.match(/clk\?jk=([^&]+)/);
      const jobId = idMatch?.[1] || relativeUrl?.split('?')[0]?.split('_')?.pop() || `browser-${Date.now()}-${index}`;

      const description = text([
        '[data-testid="job-snippet"]',
        'div.job-snippet',
        'div.summary',
        'ul',
        'li',
        "td.resultContent div[class*='snippet']",
      ]) || 'No description available';

      return {
        id: `indeed-${jobId}`,
        title: text(['h2.jobTitle span', 'h2.jobTitle', 'h2 span']) || 'Unknown Title',
        company: text([
          '[data-testid="company-name"]',
          'span.companyName',
          'div.company_location [data-testid="company-name"]',
          'div.company_location span.companyName',
          'div.company span',
        ]) || 'Unknown Company',
        location: text([
          '[data-testid="text-location"]',
          'div.companyLocation',
          'div.company_location .companyLocation',
          'div.location',
        ]) || fallbackLocation,
        description: normalizeDescription(description),
        salary: text(['div.salary-snippet-container', 'div.salarySnippet', 'span.salaryText']) || 'Salary not specified',
        url,
        time_posted: text(['span.date', 'div.result-footer span.date', 'table.jobCardShelfContainer div.result-footer span.date']) || 'Recently',
        source: 'Indeed',
      };
    });
  }, location);
};

const extractJobDetails = async (page, job, fallbackLocation) => {
  try {
    const response = await page.goto(job.url, { waitUntil: 'domcontentloaded' });
    const status = response?.status();
    console.log(`Indeed detail response status for ${job.id}: ${status}`);

    if (!response || status >= 400) {
      return null;
    }

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    return page.evaluate((location) => {
      const text = (selectorList) => {
        for (const selector of selectorList) {
          const element = document.querySelector(selector);
          if (element?.textContent?.trim()) {
            return element.textContent.replace(/\s+/g, ' ').trim();
          }
        }
        return null;
      };

      const descriptionRoot = document.querySelector('#jobDescriptionText, [data-testid="jobsearch-JobComponent-description"], .jobsearch-JobComponent-description');
      const description = descriptionRoot?.textContent?.replace(/\s+/g, ' ').trim() || null;

      return {
        company: text([
          '[data-testid="inlineHeader-companyName"]',
          '[data-testid="company-name"]',
          '.jobsearch-CompanyInfoWithoutHeaderImage div[data-company-name="true"]',
          '.jobsearch-CompanyInfoContainer a',
          '.jobsearch-InlineCompanyRating div:first-child',
        ]),
        location: text([
          '[data-testid="inlineHeader-companyLocation"]',
          '[data-testid="job-location"]',
          '.jobsearch-JobInfoHeader-subtitle div:last-child',
        ]) || location,
        description,
      };
    }, fallbackLocation);
  } catch (error) {
    console.error(`Failed to enrich Indeed job ${job.id}:`, error.message);
    return null;
  }
};

const enrichJobsWithDetails = async (context, jobs, location) => {
  const detailPage = await context.newPage();
  detailPage.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  try {
    const enrichedJobs = [];

    for (const job of jobs) {
      const needsDetail =
        !job.company ||
        job.company === 'Unknown Company' ||
        !job.description ||
        job.description === 'No description available';

      if (!needsDetail || !job.url || job.url === '#') {
        enrichedJobs.push(job);
        continue;
      }

      const details = await extractJobDetails(detailPage, job, location);

      const mergedDescription = compactText(details?.description);
      const mergedCompany = compactText(details?.company);
      const mergedLocation = compactText(details?.location);

      enrichedJobs.push({
        ...job,
        company: mergedCompany || job.company,
        location: mergedLocation || job.location,
        description: normalizeDescription(mergedDescription || job.description),
      });
    }

    return enrichedJobs;
  } finally {
    await detailPage.close();
  }
};

const scrapeIndeedJobsBrowser = async (title, location, numJobs = 50) => {
  let browser;
  const allJobs = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1440, height: 1200 },
    });

    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

    let pageIndex = 0;

    while (allJobs.length < numJobs) {
      const start = pageIndex * 10;
      const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(title)}&l=${encodeURIComponent(location)}&start=${start}`;
      console.log(`Loading Indeed page ${pageIndex + 1}: ${url}`);

      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      const status = response?.status();
      console.log(`Indeed browser response status: ${status}`);

      if (!response || status >= 400) {
        if (allJobs.length > 0) {
          console.warn(`Indeed blocked page ${pageIndex + 1} with status ${status}. Returning ${allJobs.length} jobs collected so far.`);
          break;
        }

        throw new Error(`Indeed responded with status ${status}`);
      }

      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);

      const jobsOnPage = await extractJobsFromPage(page, location);
      console.log(`Indeed browser scraper found ${jobsOnPage.length} jobs on page ${pageIndex + 1}`);

      if (jobsOnPage.length === 0) {
        break;
      }

      const enrichedJobsOnPage = await enrichJobsWithDetails(context, jobsOnPage, location);

      for (const job of enrichedJobsOnPage) {
        if (!allJobs.find((existingJob) => existingJob.id === job.id)) {
          allJobs.push(job);
        }
        if (allJobs.length >= numJobs) {
          break;
        }
      }

      pageIndex += 1;
    }

    return allJobs;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

module.exports = {
  scrapeIndeedJobsBrowser,
};
