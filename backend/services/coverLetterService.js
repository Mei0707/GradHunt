const { getJobDetails } = require('./jobDetailService');

const DEFAULT_OPENAI_MODEL =
  process.env.OPENAI_JOB_MODEL || process.env.OPENAI_RESUME_MODEL || 'gpt-4.1-mini';

const compactText = (value = '') => value.replace(/\s+/g, ' ').trim();
const formatLetterText = (value = '') =>
  value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const extractResponseText = (responseJson) => {
  if (typeof responseJson.output_text === 'string' && responseJson.output_text.trim()) {
    return formatLetterText(responseJson.output_text);
  }

  const outputText = responseJson.output
    ?.flatMap((item) => item.content || [])
    ?.map((contentItem) => contentItem.text || contentItem.output_text || '')
    ?.filter(Boolean)
    ?.join('\n\n');

  return formatLetterText(outputText || '');
};

const buildResumeContext = (resume = {}) => {
  const analysis = resume.analysis || {};

  return [
    `Candidate summary: ${analysis.candidate_summary || 'Not provided'}`,
    `Experience level: ${analysis.experience_level || 'Not provided'}`,
    `Target roles: ${(analysis.target_roles || []).join(', ') || 'Not provided'}`,
    `Skills: ${(analysis.skills || []).join(', ') || 'Not provided'}`,
    `Tools and frameworks: ${(analysis.tools_and_frameworks || []).join(', ') || 'Not provided'}`,
    `Strengths: ${(analysis.strengths || []).join(', ') || 'Not provided'}`,
    `Preferred locations: ${(analysis.preferred_locations || []).join(', ') || 'Not provided'}`,
    `Resume text preview: ${compactText(resume.extractedTextPreview || '').slice(0, 1800) || 'Not provided'}`,
  ].join('\n');
};

const generateCoverLetter = async ({ job, resume }) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  if (!resume?.analysis) {
    throw new Error('Resume analysis is required to generate a cover letter.');
  }

  const detailedJob = await getJobDetails(job);
  const jobContext = [
    `Job title: ${detailedJob.title || job.title}`,
    `Company: ${detailedJob.company || job.company}`,
    `Location: ${detailedJob.location || job.location}`,
    `Job overview: ${compactText(detailedJob.overview || detailedJob.description || '').slice(0, 2000) || 'Not provided'}`,
    `Full description: ${compactText(detailedJob.fullDescription || detailedJob.description || '').slice(0, 4000) || 'Not provided'}`,
  ].join('\n');

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
              text:
                'Write a formal cover letter for a student or new-grad applicant. Use only the provided resume and job information. Keep it specific to the role and company, do not invent experience, and keep it under 260 words. Format it like a real letter with: 1) greeting line "Dear Hiring Team," 2) 3 short body paragraphs 3) closing line "Sincerely," and a final signature line "GradHunt Candidate". Return only the letter text with paragraph breaks preserved.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Resume information:\n${buildResumeContext(resume)}\n\nJob information:\n${jobContext}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI cover letter generation failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const coverLetter = extractResponseText(data);

  if (!coverLetter) {
    throw new Error('No cover letter text was returned.');
  }

  return {
    coverLetter,
    job: detailedJob,
  };
};

module.exports = {
  generateCoverLetter,
};
