import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 1, iterations: 1 };
const base = __ENV.BASE_URL || 'http://127.0.0.1';
export default function () {
  for (const path of ['/api/health','/api/products?page=1&limit=1']) {
    const r = http.get(`${base}${path}`);
    check(r, { [`${path} reachable`]: x => x.status === 200 });
  }
}
