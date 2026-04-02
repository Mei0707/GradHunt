const { chromium } = require('playwright');

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_JOB_MODEL || process.env.OPENAI_RESUME_MODEL || 'gpt-4.1-mini';

const compactText = (value = '') => value.replace(/\s+/g, ' ').trim();

const SECTION_STOP_PATTERNS = [
  /^job details?/i,
  /^pay\b/i,
  /^benefits?\b/i,
  /^schedule\b/i,
  /^supplemental pay\b/i,
  /^work location\b/i,
  /^work setting\b/i,
  /^job type\b/i,
  /^profile insights\b/i,
  /^skills\b/i,
  /^education\b/i,
];

const extractOverviewText = (fullDescription = '') => {
  const normalized = compactText(fullDescription);
  if (!normalized) {
    return '';
  }

  const sectionMatch = normalized.match(
    /(full job description|job overview|about [^.:\n]+|about the role|about us|responsibilities|what you'll do|duties|role overview)\s*:?\s*(.*)$/i
  );
  const baseText = sectionMatch?.[2] || normalized;
  const parts = baseText
    .split(/(?=(?:job details?|pay\b|benefits?\b|schedule\b|supplemental pay\b|work location\b|work setting\b|job type\b|profile insights\b|skills\b|education\b))/i)
    .map((part) => compactText(part))
    .filter(Boolean);

  const keptParts = [];
  for (const part of parts) {
    if (SECTION_STOP_PATTERNS.some((pattern) => pattern.test(part))) {
      break;
    }
    keptParts.push(part);
  }

  const overview = compactText(keptParts.join(' ')) || baseText;
  return overview;
};

const summarizeJobDescription = async ({ title, company, description }) => {
  if (!process.env.OPENAI_API_KEY || !description || description.length < 120) {
    return null;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Write a short job overview for students and new grads. Use only the provided text. Exclude salary, benefits, work setting, and application boilerplate. Keep it to 2 short sentences.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Job title: ${title}\nCompany: ${company}\n\nJob description:\n${description}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI job summary failed: ${response.status} ${errorText}`);
  }

  const responseJson = await response.json();
  return responseJson.output_text ? compactText(responseJson.output_text) : null;
};

const fetchIndeedJobDetails = async (job) => {
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1440, height: 1200 },
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.setExtraHTTPHeaders({
      referer: 'https://www.indeed.com/',
      'accept-language': 'en-US,en;q=0.9',
    });

    const response = await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const status = response?.status();
    console.log(`On-demand Indeed detail response status for ${job.id}: ${status}`);

    if (!response || status >= 400) {
      throw new Error(`Indeed responded with status ${status}`);
    }

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    const details = await page.evaluate(({ fallbackCompany, fallbackLocation }) => {
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
      const fullDescription = descriptionRoot?.textContent?.replace(/\s+/g, ' ').trim() || null;

      return {
        company: text([
          '[data-testid="inlineHeader-companyName"]',
          '[data-testid="company-name"]',
          '.jobsearch-CompanyInfoWithoutHeaderImage div[data-company-name="true"]',
          '.jobsearch-CompanyInfoContainer a',
          '.jobsearch-InlineCompanyRating div:first-child',
        ]) || fallbackCompany,
        location: text([
          '[data-testid="inlineHeader-companyLocation"]',
          '[data-testid="job-location"]',
          '.jobsearch-JobInfoHeader-subtitle div:last-child',
        ]) || fallbackLocation,
        fullDescription,
      };
    }, {
      fallbackCompany: job.company,
      fallbackLocation: job.location,
    });

    const overviewText = extractOverviewText(details.fullDescription || job.description || '');

    const summary = await summarizeJobDescription({
      title: job.title,
      company: details.company || job.company,
      description: overviewText || details.fullDescription || job.description,
    }).catch((error) => {
      console.warn(`AI summary failed for ${job.id}: ${error.message}`);
      return null;
    });

    return {
      ...job,
      company: details.company || job.company,
      location: details.location || job.location,
      description: summary || overviewText || job.description,
      overview: summary || overviewText || job.description,
      fullDescription: details.fullDescription || job.description,
      aiSummary: summary,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

const getJobDetails = async (job) => {
  if (!job?.url) {
    throw new Error('Job URL is required.');
  }

  if (job.source === 'Indeed') {
    return fetchIndeedJobDetails(job);
  }

  return {
    ...job,
    overview: job.description || 'No description available',
    fullDescription: job.description || 'No description available',
    aiSummary: null,
  };
};

module.exports = {
  getJobDetails,
};
