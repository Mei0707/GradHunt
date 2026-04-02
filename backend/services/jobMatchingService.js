const normalize = (value = '') => value.toLowerCase().trim();

const tokenize = (value = '') =>
  normalize(value)
    .split(/[^a-z0-9+#.]+/)
    .filter(Boolean);

const uniqueNormalizedList = (items = []) =>
  [...new Set(items.map((item) => normalize(item)).filter(Boolean))];

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

  const matchedRoles = targetRoles.filter((role) => titleText.includes(role));
  if (matchedRoles.length > 0) {
    score += 35;
    reasons.push(`Role match: ${matchedRoles.slice(0, 2).join(', ')}`);
  }

  const matchedSkills = skills.filter((skill) => combinedText.includes(skill));
  if (matchedSkills.length > 0) {
    score += Math.min(30, matchedSkills.length * 6);
    reasons.push(`Skills: ${matchedSkills.slice(0, 3).join(', ')}`);
  }

  const matchedTools = tools.filter((tool) => combinedText.includes(tool));
  if (matchedTools.length > 0) {
    score += Math.min(20, matchedTools.length * 5);
    reasons.push(`Tools: ${matchedTools.slice(0, 3).join(', ')}`);
  }

  const matchedLocations = preferredLocations.filter((preferredLocation) => locationText.includes(preferredLocation));
  if (matchedLocations.length > 0) {
    score += 10;
    reasons.push(`Location: ${matchedLocations[0]}`);
  }

  const experienceLevel = normalize(resumeProfile.experience_level);
  const experienceHints = ['intern', 'internship', 'new grad', 'graduate', 'entry level', 'junior'];
  const experienceMatch = experienceHints.some((hint) => titleText.includes(hint) || descriptionText.includes(hint));
  if (experienceLevel && experienceMatch) {
    score += 10;
    reasons.push(`Experience level fit: ${resumeProfile.experience_level}`);
  }

  const strengthMatches = strengths.filter((strength) => combinedText.includes(strength));
  if (strengthMatches.length > 0) {
    score += Math.min(10, strengthMatches.length * 3);
    reasons.push(`Strengths: ${strengthMatches.slice(0, 2).join(', ')}`);
  }

  const roundedScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    ...job,
    matchScore: roundedScore,
    matchReasons: reasons,
  };
};

const rankJobsForResume = (jobs, resumeProfile) => {
  if (!resumeProfile) {
    return jobs;
  }

  return jobs
    .map((job) => scoreJobAgainstResume(job, resumeProfile))
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return new Date(b.created || 0) - new Date(a.created || 0);
    });
};

module.exports = {
  rankJobsForResume,
};
