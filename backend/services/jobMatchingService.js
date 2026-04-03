const normalize = (value = '') => value.toLowerCase().trim();
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_CACHE_TTL_MS = 60 * 60 * 1000;
const embeddingCache = new Map();

const uniqueNormalizedList = (items = []) =>
  [...new Set(items.map((item) => normalize(item)).filter(Boolean))];

const tokenizeWords = (value = '') =>
  normalize(value)
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);

const includesPhrase = (haystack, phrase) => {
  const normalizedHaystack = normalize(haystack);
  const normalizedPhrase = normalize(phrase);

  if (!normalizedPhrase) {
    return false;
  }

  return normalizedHaystack.includes(normalizedPhrase);
};

const countMatches = (items, haystack) =>
  items.filter((item) => includesPhrase(haystack, item));

const compactText = (value = '') => value.replace(/\s+/g, ' ').trim();

const truncateForEmbedding = (value = '', maxLength = 6000) =>
  compactText(value).slice(0, maxLength);

const cosineSimilarity = (first = [], second = []) => {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length || first.length === 0) {
    return 0;
  }

  let dot = 0;
  let firstNorm = 0;
  let secondNorm = 0;

  for (let index = 0; index < first.length; index += 1) {
    dot += first[index] * second[index];
    firstNorm += first[index] * first[index];
    secondNorm += second[index] * second[index];
  }

  if (firstNorm === 0 || secondNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(firstNorm) * Math.sqrt(secondNorm));
};

const normalizeSimilarityToScore = (similarity) => {
  const bounded = Math.max(0, Math.min(1, (similarity - 0.1) / 0.45));
  return Math.round(bounded * 100);
};

const buildResumeEmbeddingText = (resumeProfile = {}) =>
  truncateForEmbedding(
    [
      `Candidate summary: ${resumeProfile.candidate_summary || ''}`,
      `Experience level: ${resumeProfile.experience_level || ''}`,
      `Target roles: ${(resumeProfile.target_roles || []).join(', ')}`,
      `Skills: ${(resumeProfile.skills || []).join(', ')}`,
      `Tools and frameworks: ${(resumeProfile.tools_and_frameworks || []).join(', ')}`,
      `Strengths: ${(resumeProfile.strengths || []).join(', ')}`,
      `Preferred locations: ${(resumeProfile.preferred_locations || []).join(', ')}`,
    ].join('\n')
  );

const buildJobEmbeddingText = (job = {}) =>
  truncateForEmbedding(
    [
      `Title: ${job.title || ''}`,
      `Company: ${job.company || ''}`,
      `Location: ${job.location || ''}`,
      `Source: ${job.source || ''}`,
      `Description: ${job.description || ''}`,
    ].join('\n')
  );

const getCachedEmbedding = (text) => {
  const cacheEntry = embeddingCache.get(text);
  if (!cacheEntry) {
    return null;
  }

  if (cacheEntry.expiresAt <= Date.now()) {
    embeddingCache.delete(text);
    return null;
  }

  return cacheEntry.embedding;
};

const cacheEmbedding = (text, embedding) => {
  embeddingCache.set(text, {
    embedding,
    expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS,
  });
};

const fetchEmbeddings = async (texts) => {
  if (!process.env.OPENAI_API_KEY) {
    return new Map();
  }

  const normalizedTexts = texts.map((text) => truncateForEmbedding(text));
  const embeddingsByText = new Map();
  const uncachedTexts = [];

  normalizedTexts.forEach((text) => {
    const cachedEmbedding = getCachedEmbedding(text);
    if (cachedEmbedding) {
      embeddingsByText.set(text, cachedEmbedding);
    } else if (!uncachedTexts.includes(text)) {
      uncachedTexts.push(text);
    }
  });

  if (uncachedTexts.length > 0) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: uncachedTexts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI embeddings failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    data.data?.forEach((item, index) => {
      const text = uncachedTexts[index];
      if (!text || !Array.isArray(item.embedding)) {
        return;
      }

      cacheEmbedding(text, item.embedding);
      embeddingsByText.set(text, item.embedding);
    });
  }

  return embeddingsByText;
};

const hasTokenOverlap = (item, haystack, minimumOverlap = 1) => {
  const itemTokens = tokenizeWords(item);
  if (itemTokens.length === 0) {
    return false;
  }

  const haystackTokens = new Set(tokenizeWords(haystack));
  const overlap = itemTokens.filter((token) => haystackTokens.has(token)).length;

  return overlap >= minimumOverlap;
};

const matchItems = (items, titleText, combinedText) =>
  items.reduce(
    (matches, item) => {
      const itemTokens = tokenizeWords(item);
      const minimumOverlap = itemTokens.length >= 3 ? 2 : 1;
      const inTitle = includesPhrase(titleText, item) || hasTokenOverlap(item, titleText, minimumOverlap);
      const inCombined =
        inTitle ||
        includesPhrase(combinedText, item) ||
        hasTokenOverlap(item, combinedText, minimumOverlap);

      if (!inCombined) {
        return matches;
      }

      matches.push({
        item,
        inTitle,
      });
      return matches;
    },
    []
  );

const scoreJobAgainstResume = (job, resumeProfile) => {
  if (!resumeProfile) {
    return {
      ...job,
      matchScore: null,
      heuristicMatchScore: null,
      semanticMatchScore: null,
      matchReasons: [],
    };
  }

  const titleText = normalize(job.title);
  const descriptionText = normalize(job.description);
  const locationText = normalize(job.location);
  const combinedText = `${titleText} ${descriptionText}`;

  const targetRoles = uniqueNormalizedList(resumeProfile.target_roles);
  const skills = uniqueNormalizedList(resumeProfile.skills);
  const tools = uniqueNormalizedList(resumeProfile.tools_and_frameworks);
  const preferredLocations = uniqueNormalizedList(resumeProfile.preferred_locations);
  const strengths = uniqueNormalizedList(resumeProfile.strengths);

  let score = 0;
  const reasons = [];

  const matchedRoles = matchItems(targetRoles, titleText, combinedText);
  if (matchedRoles.length > 0) {
    const roleScore = matchedRoles.reduce(
      (total, match) => total + (match.inTitle ? 18 : 10),
      0
    );
    score += Math.min(roleScore, 34);
    reasons.push(`Role match: ${matchedRoles.slice(0, 2).map((match) => match.item).join(', ')}`);
  } else {
    const partialRoleMatch = targetRoles.some((role) =>
      hasTokenOverlap(role, titleText, tokenizeWords(role).length >= 3 ? 2 : 1)
    );
    if (partialRoleMatch) {
      score += 18;
      reasons.push('Related title match');
    }
  }

  const matchedSkills = matchItems(skills, titleText, combinedText);
  if (matchedSkills.length > 0) {
    const skillScore = matchedSkills.reduce((total, skill) => {
      return total + (skill.inTitle ? 12 : 9);
    }, 0);
    score += Math.min(skillScore, 54);
    reasons.push(`Skills: ${matchedSkills.slice(0, 4).map((match) => match.item).join(', ')}`);
  }

  const matchedTools = matchItems(tools, titleText, combinedText);
  if (matchedTools.length > 0) {
    const toolScore = matchedTools.reduce((total, tool) => {
      return total + (tool.inTitle ? 9 : 7);
    }, 0);
    score += Math.min(toolScore, 28);
    reasons.push(`Tools: ${matchedTools.slice(0, 4).map((match) => match.item).join(', ')}`);
  }

  const matchedLocations = countMatches(preferredLocations, locationText);
  if (matchedLocations.length > 0) {
    score += 12;
    reasons.push(`Location: ${matchedLocations[0]}`);
  }

  const experienceLevel = normalize(resumeProfile.experience_level);
  const internshipHints = ['intern', 'internship', 'co-op', 'co op'];
  const earlyCareerHints = ['new grad', 'graduate', 'entry level', 'junior', 'associate'];
  const internshipJob = internshipHints.some((hint) => titleText.includes(hint) || descriptionText.includes(hint));
  const earlyCareerJob = earlyCareerHints.some((hint) => titleText.includes(hint) || descriptionText.includes(hint));

  if (experienceLevel) {
    const wantsIntern = experienceLevel.includes('intern');
    const wantsNewGrad = experienceLevel.includes('new grad') || experienceLevel.includes('graduate');

    if ((wantsIntern && internshipJob) || (wantsNewGrad && earlyCareerJob)) {
      score += 15;
      reasons.push(`Experience level fit: ${resumeProfile.experience_level}`);
    } else if (!wantsIntern && internshipJob) {
      score -= 10;
    }
  }

  const strengthMatches = countMatches(strengths, combinedText);
  if (strengthMatches.length > 0) {
    score += strengthMatches.length * 5;
    reasons.push(`Strengths: ${strengthMatches.slice(0, 2).join(', ')}`);
  }

  if (matchedSkills.length >= 3) {
    score += 12;
  } else if (matchedSkills.length >= 2) {
    score += 8;
  }

  if (matchedSkills.length > 0 && matchedTools.length > 0) {
    score += 8;
  }

  if (matchedRoles.length > 0 && matchedSkills.length > 0) {
    score += 10;
  }

  const evidenceCount =
    matchedRoles.length +
    matchedSkills.length +
    matchedTools.length +
    matchedLocations.length +
    strengthMatches.length;

  if (evidenceCount >= 6 && score < 60) {
    score = 60;
  } else if (evidenceCount >= 4 && score < 48) {
    score = 48;
  } else if (evidenceCount >= 3 && score < 38) {
    score = 38;
  }

  return {
    ...job,
    matchScore: Math.max(0, Math.round(score)),
    heuristicMatchScore: Math.max(0, Math.round(score)),
    semanticMatchScore: null,
    matchReasons: reasons,
  };
};

const calibrateRankedScores = (rankedJobs) => {
  const topScore = rankedJobs[0]?.matchScore || 0;

  if (topScore <= 0) {
    return rankedJobs;
  }

  const boostFactor = topScore < 70 ? 78 / topScore : 1;

  return rankedJobs.map((job, index) => {
    let calibratedScore = Math.round(job.matchScore * boostFactor);

    if (index === 0) {
      calibratedScore = Math.max(calibratedScore, 78);
    } else if (index < 5) {
      calibratedScore = Math.max(calibratedScore, 62);
    } else if (job.matchScore >= 38) {
      calibratedScore = Math.max(calibratedScore, 45);
    }

    return {
      ...job,
      matchScore: Math.min(100, calibratedScore),
    };
  });
};

const applyEmbeddingScores = async (jobs, resumeProfile) => {
  const resumeText = buildResumeEmbeddingText(resumeProfile);
  if (!resumeText) {
    return jobs;
  }

  const jobTexts = jobs.map((job) => buildJobEmbeddingText(job));
  const embeddingsByText = await fetchEmbeddings([resumeText, ...jobTexts]);
  const resumeEmbedding = embeddingsByText.get(resumeText);

  if (!resumeEmbedding) {
    return jobs;
  }

  return jobs.map((job, index) => {
    const jobEmbedding = embeddingsByText.get(jobTexts[index]);
    if (!jobEmbedding) {
      return job;
    }

    const similarity = cosineSimilarity(resumeEmbedding, jobEmbedding);
    const semanticMatchScore = normalizeSimilarityToScore(similarity);
    const hybridScore = Math.round((job.heuristicMatchScore || 0) * 0.7 + semanticMatchScore * 0.3);
    const nextReasons =
      semanticMatchScore >= 70
        ? [...job.matchReasons, 'Strong semantic resume alignment']
        : job.matchReasons;

    return {
      ...job,
      matchScore: hybridScore,
      semanticMatchScore,
      matchReasons: nextReasons,
    };
  });
};

const rankJobsForResume = async (jobs, resumeProfile) => {
  if (!resumeProfile) {
    return jobs;
  }

  const heuristicallyScoredJobs = jobs.map((job) => scoreJobAgainstResume(job, resumeProfile));

  let hybridScoredJobs = heuristicallyScoredJobs;
  try {
    hybridScoredJobs = await applyEmbeddingScores(heuristicallyScoredJobs, resumeProfile);
  } catch (error) {
    console.warn(`Embedding similarity scoring failed, falling back to heuristic scores: ${error.message}`);
  }

  const rankedJobs = hybridScoredJobs.sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    return new Date(b.created || 0) - new Date(a.created || 0);
  });

  return calibrateRankedScores(rankedJobs);
};

module.exports = {
  rankJobsForResume,
};
