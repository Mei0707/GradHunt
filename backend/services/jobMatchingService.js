const normalize = (value = '') => value.toLowerCase().trim();

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
    matchReasons: reasons,
  };
};

const rankJobsForResume = (jobs, resumeProfile) => {
  if (!resumeProfile) {
    return jobs;
  }

  const rankedJobs = jobs
    .map((job) => scoreJobAgainstResume(job, resumeProfile))
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return new Date(b.created || 0) - new Date(a.created || 0);
    });

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

module.exports = {
  rankJobsForResume,
};
