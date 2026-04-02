const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const uploadsDir = path.join(__dirname, '../uploads/resumes');
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_RESUME_MODEL || 'gpt-4.1-mini';

const RESUME_ANALYSIS_SCHEMA = {
  name: 'resume_profile',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      candidate_summary: { type: 'string' },
      experience_level: { type: 'string' },
      target_roles: {
        type: 'array',
        items: { type: 'string' },
      },
      skills: {
        type: 'array',
        items: { type: 'string' },
      },
      tools_and_frameworks: {
        type: 'array',
        items: { type: 'string' },
      },
      preferred_locations: {
        type: 'array',
        items: { type: 'string' },
      },
      education: {
        type: 'array',
        items: { type: 'string' },
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
      },
      suggested_search_keywords: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: [
      'candidate_summary',
      'experience_level',
      'target_roles',
      'skills',
      'tools_and_frameworks',
      'preferred_locations',
      'education',
      'strengths',
      'suggested_search_keywords',
    ],
  },
  strict: true,
};

const normalizeWhitespace = (text) => text.replace(/\s+/g, ' ').trim();

const extractTextWithTextutil = async (filePath) => {
  const { stdout } = await execFileAsync('/usr/bin/textutil', ['-convert', 'txt', '-stdout', filePath], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return normalizeWhitespace(stdout);
};

const extractPdfTextWithMdls = async (filePath) => {
  const { stdout } = await execFileAsync('/usr/bin/mdls', ['-name', 'kMDItemTextContent', '-raw', filePath], {
    maxBuffer: 10 * 1024 * 1024,
  });

  const text = stdout.trim();
  if (!text || text === '(null)') {
    return '';
  }

  return normalizeWhitespace(text);
};

const extractResumeText = async (storedFileName) => {
  const filePath = path.join(uploadsDir, storedFileName);
  if (!fs.existsSync(filePath)) {
    throw new Error('Uploaded resume file was not found.');
  }

  const extension = path.extname(storedFileName).toLowerCase();

  if (extension === '.txt') {
    return normalizeWhitespace(fs.readFileSync(filePath, 'utf8'));
  }

  if (extension === '.pdf') {
    const pdfText = await extractPdfTextWithMdls(filePath);
    if (pdfText) {
      return pdfText;
    }
  }

  if (extension === '.doc' || extension === '.docx' || extension === '.pdf') {
    const extractedText = await extractTextWithTextutil(filePath);
    if (extractedText) {
      return extractedText;
    }
  }

  throw new Error('Could not extract readable text from this resume file.');
};

const parseStructuredOutput = (responseJson) => {
  if (responseJson.output_text) {
    return JSON.parse(responseJson.output_text);
  }

  const textContent = responseJson.output
    ?.flatMap((item) => item.content || [])
    ?.find((contentItem) => typeof contentItem.text === 'string')
    ?.text;

  if (!textContent) {
    throw new Error('OpenAI did not return structured analysis text.');
  }

  return JSON.parse(textContent);
};

const analyzeResumeText = async (resumeText) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
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
              text: 'You analyze student and new-grad resumes for job matching. Return concise, structured facts only. Do not invent experience or skills that are not supported by the resume.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Analyze this resume for internship/new-grad job matching.\n\nResume text:\n${resumeText}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          ...RESUME_ANALYSIS_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI analysis failed: ${response.status} ${errorText}`);
  }

  const responseJson = await response.json();
  return parseStructuredOutput(responseJson);
};

const analyzeStoredResume = async (storedFileName) => {
  const resumeText = await extractResumeText(storedFileName);
  const analysis = await analyzeResumeText(resumeText);

  return {
    analysis,
    extractedTextPreview: resumeText.slice(0, 800),
  };
};

module.exports = {
  analyzeStoredResume,
  extractResumeText,
};
