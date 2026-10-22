// Thin client for the Python agent microservice (FastAPI + LangGraph).
//
// The Node API stays the gateway: it owns auth, scraping, and resume storage,
// then delegates the heavy multi-agent reasoning to the agent service. Keeping
// this in one module means the base URL, shared-secret header, and timeout are
// configured once.

const AGENT_SERVICE_URL = (process.env.AGENT_SERVICE_URL || 'http://localhost:8100').replace(/\/+$/, '');
const AGENT_SERVICE_TOKEN = process.env.AGENT_SERVICE_TOKEN || '';
const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_SERVICE_TIMEOUT_MS || 120000);
const { createCircuitBreaker } = require('../lib/recovery');
const { metric } = require('../lib/telemetry');
const agentCircuit = createCircuitBreaker();

const callAgentService = async (path, body, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => agentCircuit(async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${AGENT_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AGENT_SERVICE_TOKEN ? { 'X-Internal-Token': AGENT_SERVICE_TOKEN } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { detail: text };
    }

    if (!response.ok) {
      const detail = payload?.detail || `Agent service returned ${response.status}`;
      const error = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      error.statusCode = response.status;
      throw error;
    }

    return payload;
  } catch (error) {
    metric({ DependencyFailures: 1 }, {}, { Dependency: 'agent' });
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Agent service request timed out.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    if (error.cause?.code === 'ECONNREFUSED' || error.code === 'ECONNREFUSED') {
      const downError = new Error('Agent service is unavailable. Is it running on AGENT_SERVICE_URL?');
      downError.statusCode = 503;
      throw downError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
});

const optimizeResume = async ({ userId, resumeText, jobDescription, jobTitle, company }) =>
  callAgentService('/api/agents/resume-optimization', {
    user_id: userId,
    resume_text: resumeText,
    job_description: jobDescription,
    job_title: jobTitle || null,
    company: company || null,
  });

module.exports = {
  callAgentService,
  optimizeResume,
};
