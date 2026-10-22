import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const apiRequests = new Counter('api_requests');
const apiFailures = new Rate('api_failures');
const apiLatency = new Trend('api_latency', true);
const searchFailures = new Rate('search_failures');
const searchLatency = new Trend('search_latency', true);
const base = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const options = {
  vus: Number(__ENV.VUS || 5), duration: __ENV.DURATION || '30s',
  thresholds: {
    checks: ['rate==1'],
    api_failures: ['rate<=0.001'], api_latency: ['p(95)<1000'],
    ...( __ENV.RUN_SEARCH === 'true' ? { search_failures: ['rate<=0.01'], search_latency: ['p(95)<120000'] } : {} ),
  },
};
export default function () {
  // Cheap auth path exercises middleware and verifies unauthenticated access is denied.
  const response = http.get(`${base}/api/auth/me`, {
    responseCallback: http.expectedStatuses(401), tags: { name: 'auth_required' }, timeout: '5s',
  });
  apiRequests.add(1);
  apiFailures.add(response.status !== 401);
  apiLatency.add(response.timings.duration);
  check(response, { 'auth enforced': r => r.status === 401 });
  const ready = http.get(`${base}/api/health/ready`, { tags: { name: 'readiness' }, timeout: '5s' });
  check(ready, { 'database ready': r => r.status === 200 });
  if (__ENV.RUN_SEARCH === 'true') {
    const search = http.post(`${base}/api/jobs/search`, JSON.stringify({ role: 'software engineer', location: 'New York', page: 1 }), {
      headers: { 'Content-Type': 'application/json' }, tags: { name: 'job_search' }, timeout: '130s',
    });
    searchFailures.add(search.status !== 200);
    searchLatency.add(search.timings.duration);
    check(search, { 'job search succeeds': r => r.status === 200 });
  }
  sleep(1);
}
