const { chromium } = require('playwright');

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_ENRICHED_JOBS_PER_PAGE = 3;
const ENRICHMENT_TIMEOUT_MS = 8000;
const RESULTS_SELECTOR = [
  'div.job_seen_beacon',
  'div.jobsearch-ResultsList > div.cardOutline',
  'div.cardOutline.tapItem',
  'a.tapItem',
].join(', ');

const compactText = (value) => value?.replace(/\s+/g, ' ').trim() || null;

const normalizeDescription = (value) => {
  const text = compactText(value);
  if (!text) {
    return 'No description available';
  }

  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
};

const withTimeout = (task, timeoutMs) =>
  Promise.race([
    task,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);

const extractJobsFromPage = async (page, location) => {
  return page.evaluate((fallbackLocation) => {
    const normalizeDescription = (value) => {
      const text = value?.replace(/\s+/g, ' ').trim();
      if (!text) {
        return 'No description available';
      }

      return text.length > 300 ? `${text.slice(0, 300)}...` : text;
    };

    const buildIndeedViewJobUrl = (href) => {
      if (!href) {
        return '#';
      }

      try {
        const parsedUrl = new URL(href, 'https://www.indeed.com');
        const jobKey = parsedUrl.searchParams.get('jk');

        if (jobKey) {
          return `https://www.indeed.com/viewjob?jk=${jobKey}&from=serp&vjs=3`;
        }

        return parsedUrl.toString();
      } catch {
        return '#';
      }
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
          if (!normalized) {
            return false;
          }

          if (ignored.has(normalized)) {
            return false;
          }

          if (
            normalized === 'easily apply' ||
            normalized === 'just posted' ||
            normalized === 'today' ||
            normalized === 'active today'
          ) {
            return false;
          }

          if (/^\d+\+?\s*days ago$/.test(normalized) || /^\d+\+?\s*hours ago$/.test(normalized)) {
            return false;
          }

          if (/^\$[\d,]+/.test(line) || /^from \$[\d,]+/i.test(line) || /^pay:/i.test(line)) {
            return false;
          }

          return true;
        });

      if (lines.length === 0) {
        return null;
      }

      return lines.slice(0, 2).join(' ');
    };

    const extractJobKeyFromHref = (href) => {
      if (!href) {
        return null;
      }

      try {
        const parsedUrl = new URL(href, 'https://www.indeed.com');
        return parsedUrl.searchParams.get('jk');
      } catch {
        const match = href.match(/[?&]jk=([^&]+)/i);
        return match?.[1] || null;
      }
    };

    const textFromRoot = (root, selectorList) => {
      if (!root) {
        return null;
      }

      for (const selector of selectorList) {
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

    const links = Array.from(document.querySelectorAll('a[href*="jk="], a[href*="/viewjob"]'));
    const seenJobKeys = new Set();
    const extractedJobs = [];

    links.forEach((link, index) => {
      const relativeUrl = link.getAttribute('href');
      const jobKey =
        extractJobKeyFromHref(relativeUrl) ||
        link.getAttribute('data-jk') ||
        link.closest('[data-jk]')?.getAttribute('data-jk') ||
        null;

      if (!jobKey || seenJobKeys.has(jobKey)) {
        return;
      }

      const card =
        link.closest('div.job_seen_beacon, div.cardOutline, a.tapItem, li, td, article') ||
        link.closest('div') ||
        link;

      const text = (selectorList) => {
        return textFromRoot(card, selectorList) || textFromRoot(link, selectorList);
      };

      const title =
        text([
          'h2.jobTitle span',
          'h2.jobTitle',
          'h2 span',
          '[data-testid="job-title"]',
        ]) ||
        link.getAttribute('aria-label') ||
        link.textContent?.replace(/\s+/g, ' ').trim() ||
        'Unknown Title';

      const url = relativeUrl
        ? buildIndeedViewJobUrl(relativeUrl)
        : '#';

      const company = text([
        '[data-testid="company-name"]',
        'span.companyName',
        'div.company_location [data-testid="company-name"]',
        'div.company_location span.companyName',
        'div.company span',
      ]) || 'Unknown Company';
      const jobLocation = text([
        '[data-testid="text-location"]',
        'div.companyLocation',
        'div.company_location .companyLocation',
        'div.location',
      ]) || fallbackLocation;
      const salary = text(['div.salary-snippet-container', 'div.salarySnippet', 'span.salaryText']) || 'Salary not specified';
      const timePosted = text(['span.date', 'div.result-footer span.date', 'table.jobCardShelfContainer div.result-footer span.date']) || 'Recently';

      const description = text([
        '[data-testid="job-snippet"]',
        'div.job-snippet',
        'div.summary',
        "td.resultContent div[class*='snippet']",
      ]) || buildFallbackDescription(card, [title, company, jobLocation, salary, timePosted]) || 'No description available';

      extractedJobs.push({
        id: `indeed-${jobKey}`,
        title,
        company,
        location: jobLocation,
        description: normalizeDescription(description),
        salary,
        url,
        time_posted: timePosted,
        source: 'Indeed',
      });

      seenJobKeys.add(jobKey);
    });

    return extractedJobs.filter((job) => {
      if (!job.url || job.url === '#') {
        return false;
      }

      if (job.title === 'Unknown Title') {
        return false;
      }

      return true;
    });
  }, location);
};

const extractJobDetails = async (detailPage, job, fallbackLocation, refererUrl = 'https://www.indeed.com/') => {
  try {
    await detailPage.setExtraHTTPHeaders({
      referer: refererUrl,
      'accept-language': 'en-US,en;q=0.9',
    });

    const response = await detailPage.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 5000 });
    const status = response?.status();
    console.log(`Indeed detail response status for ${job.id}: ${status}`);

    if (!response || status >= 400) {
      return null;
    }

    await detailPage.waitForLoadState('networkidle').catch(() => {});
    await detailPage.waitForTimeout(800);

    return detailPage.evaluate((location) => {
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

const enrichJobsWithDetailsFromResultsPage = async (page, detailPage, jobs, location, refererUrl) => {
  const cards = page.locator(RESULTS_SELECTOR);

  try {
    const enrichedJobs = [];
    let enrichedCount = 0;

    for (const [index, job] of jobs.entries()) {
      const needsDetail =
        !job.company ||
        job.company === 'Unknown Company' ||
        !job.description ||
        job.description === 'No description available' ||
        /^job types?:/i.test(job.description) ||
        /^pay:/i.test(job.description) ||
        /^from \$?\d/i.test(job.description);

      if (!needsDetail || !job.url || job.url === '#' || enrichedCount >= MAX_ENRICHED_JOBS_PER_PAGE) {
        enrichedJobs.push(job);
        continue;
      }

      let details = null;
      const jobKey = job.id.replace(/^indeed-/, '');

      try {
        const matchingLink = page.locator(`a[href*="jk=${jobKey}"]`).first();
        const card = cards.nth(index);

        await matchingLink.scrollIntoViewIfNeeded().catch(() => {});
        await card.scrollIntoViewIfNeeded().catch(() => {});

        await matchingLink.click({ force: true, timeout: 2000 }).catch(async () => {
          await card.click({ force: true, timeout: 2000 });
        });
        await page.waitForTimeout(1500);

        details = await page.evaluate((fallbackLocationForEval) => {
          const pick = (selectorList) => {
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
            company: pick([
              '[data-testid="inlineHeader-companyName"]',
              '[data-testid="company-name"]',
              '.jobsearch-CompanyInfoContainer a',
              '.jobsearch-InlineCompanyRating div:first-child',
            ]),
            location: pick([
              '[data-testid="inlineHeader-companyLocation"]',
              '[data-testid="job-location"]',
              '.jobsearch-JobInfoHeader-subtitle div:last-child',
            ]) || fallbackLocationForEval,
            description,
          };
        }, location);
      } catch (error) {
        console.warn(`Skipped results-page enrichment for Indeed job ${job.id}: ${error.message}`);
      }

      if (!details?.description) {
        details = await extractJobDetails(detailPage, job, location, refererUrl);
      }

      const mergedDescription = compactText(details?.description);
      const mergedCompany = compactText(details?.company);
      const mergedLocation = compactText(details?.location);

      enrichedJobs.push({
        ...job,
        company: mergedCompany || job.company,
        location: mergedLocation || job.location,
        description: normalizeDescription(mergedDescription || job.description),
      });
      enrichedCount += 1;
    }

    return enrichedJobs;
  } finally {
    // no-op
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
    const detailPage = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
    detailPage.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

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
      await page.waitForSelector(RESULTS_SELECTOR, { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(1500);

      const jobsOnPage = await extractJobsFromPage(page, location);
      console.log(`Indeed browser scraper found ${jobsOnPage.length} jobs on page ${pageIndex + 1}`);

      if (jobsOnPage.length === 0) {
        const pageSignals = await page.evaluate(() => ({
          title: document.title,
          hasCaptchaText: /verify you are human|unusual traffic|security check/i.test(document.body?.innerText || ''),
          bodyPreview: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 250),
        })).catch(() => null);

        console.warn(`Indeed returned no cards on page ${pageIndex + 1}.`, pageSignals);
        break;
      }

      let enrichedJobsOnPage = jobsOnPage;

      try {
        enrichedJobsOnPage = await withTimeout(
          enrichJobsWithDetailsFromResultsPage(page, detailPage, jobsOnPage, location, url),
          ENRICHMENT_TIMEOUT_MS
        );
      } catch (error) {
        console.warn(`Indeed enrichment timed out or failed on page ${pageIndex + 1}: ${error.message}. Returning base jobs from search results.`);
      }

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
