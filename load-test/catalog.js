import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    catalog: { executor: 'ramping-vus', startVUs: 5, stages: [
      { duration: '30s', target: 25 }, { duration: '60s', target: 50 },
      { duration: '60s', target: 100 }, { duration: '30s', target: 0 },
    ], gracefulRampDown: '10s' },
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800','p(99)<1500'] },
};
const base = __ENV.BASE_URL || 'https://gulshanbazarbd.com';
export default function () {
  const r1 = http.get(`${base}/api/health`);
  check(r1, { 'health 200': r => r.status === 200 });
  const r2 = http.get(`${base}/api/products?page=1&limit=24`);
  check(r2, { 'products 200': r => r.status === 200 });
  const r3 = http.get(`${base}/api/search?q=pepsi`);
  check(r3, { 'search 200/503': r => r.status === 200 || r.status === 503 });
  sleep(0.2);
}
