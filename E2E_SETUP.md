# SmartSend E2E Test Setup

## Overview

This directory contains Playwright E2E tests for the SmartSend application, validating the complete workflow: **Import → Schedule → Queue → Reply Detect → Retry**.

## Prerequisites

1. **Node.js** and npm installed
2. **SmartSend app** running at `http://localhost:3001` (default) or set `E2E_BASE_URL`
3. **Supabase** database with seeded test data
4. **Test user credentials** (currently using magic link auth - may need adjustment)

## Quick Start

### 1. Install Dependencies (if not already installed)

```bash
npm install
```

Playwright should already be in your `package-lock.json`. If not:

```bash
npx playwright install
```

### 2. Start the Application

```bash
npm run dev
```

Ensure the app is running at `http://localhost:3001`.

### 3. Run Tests

Run all E2E tests:
```bash
npm run e2e
```

Run specific SmartSend workflow test:
```bash
npm run test:e2e:smartsend
```

Run with UI (headed mode):
```bash
npm run e2e:headed
```

## Test Configuration

Configuration is in `playwright.config.ts`:

- **Base URL**: `http://localhost:3001` (or set `E2E_BASE_URL` env var)
- **Timeout**: 120s per test, 10s per assertion
- **Headless**: true (set `--headed` flag to override)
- **Trace**: on-first-retry (for debugging failed tests)

## Test Structure

### Main Test Suite

**`tests/e2e/import_schedule_queue.spec.ts`**: End-to-end workflow test

This test validates:
1. **Sign In** - Authentication flow
2. **Create Campaign** - Campaign creation
3. **Import Leads** - CSV file upload and validation
4. **Schedule** - Campaign scheduling
5. **Queue Visibility** - Jobs appearing in the queue
6. **Reply Detection** - Mock reply detection
7. **Reply Verification** - Replies showing in inbox
8. **Retry Logic** - Failed job retry functionality

### Helper Files

**`tests/utils.ts`**: Utility functions
- `makeCsv()` - Generates temporary CSV files for testing

### Mock Endpoint

**`src/app/api/replies/mock-detect/route.ts`**: Mock reply detection for E2E

Allows simulating incoming replies without actual email infrastructure.

## Environment Variables

Create a `.env.local` file or set these environment variables:

```bash
E2E_BASE_URL=http://localhost:3001
E2E_USER=test+e2e@smartsend.local
E2E_PASS=pass1234
```

**Note**: The current test assumes magic link authentication. You may need to:
1. Bypass authentication for E2E testing
2. Use a service account approach
3. Intercept and process magic link emails

## Test Data

The test uses dynamic CSV generation in `tests/utils.ts` with:
- Valid email: `test.ok@example.com`
- Invalid email: `bad-email-no-domain`

You can also use fixtures:
- `fixtures/sample_contacts.csv`
- `test-leads.csv`
- `test-contacts.csv`

## Database Requirements

### Required Tables

The E2E test expects these Supabase tables to exist:

1. **leads** - For storing imported leads
2. **campaigns** - For campaign management
3. **campaign_recipients** - For scheduling
4. **send_queue** or equivalent - For job queue
5. **email_logs** - For tracking sent emails
6. **email_replies** - For reply tracking

Migration files in `supabase/migrations/` should already set up these tables.

### Seed Data

For reliable E2E testing, consider:
- Pre-seeding a test workspace
- Using a dedicated E2E database
- Implementing database cleanup between test runs

## CI/CD Integration

To run in CI:

```yaml
# Example GitHub Actions
- name: Install dependencies
  run: npm ci
  
- name: Install Playwright browsers
  run: npx playwright install --with-deps
  
- name: Run E2E tests
  run: npm run e2e
  env:
    E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
```

## Troubleshooting

### Tests fail immediately with "not authenticated"

**Problem**: Magic link auth requires email interaction.

**Solutions**:
1. Implement an E2E auth bypass endpoint
2. Use pre-authenticated session cookies
3. Add service account authentication for tests

### Tests can't find elements

**Problem**: UI selectors don't match actual DOM.

**Solutions**:
1. Run with `--headed` to see what's happening
2. Add more flexible selectors (e.g., use test IDs)
3. Check browser console for errors

### Import CSV fails

**Problem**: CSV upload not working.

**Solutions**:
1. Verify file input selector is correct
2. Check upload endpoint is working
3. Validate CSV format matches expectations

### Queue page empty

**Problem**: Scheduled jobs not showing.

**Solutions**:
1. Ensure the queue processor is running
2. Check database for queued jobs
3. Verify RLS policies allow test user access

## Next Steps

- [ ] Implement E2E auth bypass or service account
- [ ] Add database seeding/cleanup utilities
- [ ] Increase test coverage for edge cases
- [ ] Add visual regression testing
- [ ] Set up CI/CD pipeline

## References

- [Playwright Documentation](https://playwright.dev)
- [SmartSend Campaign Docs](./CAMPAIGNS_SETUP.md)
- [SmartSend Queue System](./SEND_QUEUE_SYSTEM.md)
- [Reply Detection](./AUTOMATIC_REPLY_DETECTION.md)

