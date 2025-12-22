# Load Testing for SmartSend v2

This directory contains load testing configurations and scripts to validate performance and scalability.

## Setup

### Install Artillery

```bash
npm install -g artillery
```

Or use npx:
```bash
npx artillery quick --help
```

### Configure Environment

Create a `.env.test` file with:
```
API_KEY=your_test_api_key_here
WORKSPACE_ID=your_test_workspace_id
```

## Running Tests

### Quick Smoke Test
```bash
artillery quick --count 100 --num 10 https://smartsendhq.com/api/health
```

### Full Load Test
```bash
artillery run load-testing/artillery-config.yml
```

### Specific Scenarios
```bash
# Test analytics endpoints only
artillery run load-testing/analytics-only.yml

# Test send queue
artillery run load-testing/send-queue.yml
```

## Performance Goals

### ✅ Target Metrics

- **Average Response Time**: < 300ms for cached endpoints
- **95th Percentile**: < 500ms
- **Error Rate**: < 2%
- **Throughput**: 50+ requests/second
- **Database Query Time**: < 100ms for indexed queries

### Monitoring

During tests, monitor:
- Supabase dashboard for DB performance
- Vercel Analytics for edge function performance
- Sentry for error rates
- Response time distribution

## Test Phases

1. **Warm Up** (60s, 2 req/s) - Initialize caches
2. **Normal Load** (300s, 5 req/s) - Sustained traffic
3. **Spike Test** (120s, 20 req/s) - Burst handling

## Continuous Testing

Add to CI/CD:
```yaml
# .github/workflows/load-test.yml
- name: Run Load Tests
  run: artillery run load-testing/artillery-config.yml
```

## K6 Alternative

If you prefer K6:

```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '5m', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function() {
  let res = http.get('https://smartsendhq.com/api/dashboard/metrics');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 300ms': (r) => r.timings.duration < 300,
  });
}
```

Run with:
```bash
k6 run load-testing/k6-config.js
```

