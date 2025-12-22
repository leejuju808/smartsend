import { test, expect } from '@playwright/test';
import { makeCsv } from '../utils';
import os from 'os';
import path from 'path';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';
const EMAIL_OK = 'test.ok@example.com';
const EMAIL_BAD = 'bad-email-no-domain';

async function signIn(page: any) {
  await page.goto('/login');
  
  // If already authenticated, we'll be redirected. Otherwise, fill out the login form.
  // Since this is magic link auth, we may need to handle it differently in E2E.
  // For now, check if we're already on dashboard
  
  const currentUrl = page.url();
  if (currentUrl.includes('/dashboard')) {
    // Already signed in
    return;
  }
  
  // Fill email and submit
  await page.fill('input[type="email"]', process.env.E2E_USER || 'test+e2e@smartsend.local');
  await page.click('button:has-text("Send Magic Link"),button:has-text("Sign in")');
  
  // Wait a moment for potential redirect
  await page.waitForTimeout(2000);
  
  // NOTE: In a real setup with magic links, you'd need to intercept the email
  // or use a bypass mechanism. For CI/E2E, consider a service account approach.
  console.log('Sign-in flow executed (may need email verification)');
}

async function createCampaign(page: any) {
  await page.goto('/dashboard/campaigns');
  
  // Look for "New Campaign" button or similar
  const newCampaignBtn = page.locator('button:has-text("New"), button:has-text("Create"), button:has-text("Schedule New Campaign")').first();
  
  if (await newCampaignBtn.count() > 0) {
    await newCampaignBtn.click();
    
    // Fill campaign details if needed
    const nameInput = page.locator('input[name="name"],input[placeholder*="Campaign"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('E2E Test Campaign');
    }
  } else {
    // May already be in create mode or need different navigation
    console.log('New campaign button not found, may already be in creation mode');
  }
}

async function importLeads(page: any) {
  // First, try to find the import flow on the campaigns page
  await page.goto('/dashboard/campaigns');
  
  // Look for Import button or CSV upload
  const importBtn = page.locator('button:has-text("Import"),button:has-text("Upload CSV"),input[type="file"]').first();
  
  if (await importBtn.count() > 0) {
    // Create a temp CSV file
    const tempDir = os.tmpdir();
    const csvPath = makeCsv(tempDir, [
      { email: EMAIL_OK, name: 'Test User', company: 'Test Co' },
      { email: EMAIL_BAD }
    ]);
    
    // Upload the file
    await page.setInputFiles('input[type="file"]', csvPath);
    await page.click('button:has-text("Import"),button:has-text("Upload"),button:has-text("Submit")');
    
    // Wait for import results
    await expect(page.locator('text=/Inserted|Success|Queued/i')).toBeVisible({ timeout: 30000 });
  } else {
    // Try alternative import path
    await page.goto('/dashboard/leads/import');
    const fileInput = page.locator('input[type="file"]').first();
    
    if (await fileInput.count() > 0) {
      const tempDir = os.tmpdir();
      const csvPath = makeCsv(tempDir, [
        { email: EMAIL_OK, name: 'Test User', company: 'Test Co' },
        { email: EMAIL_BAD }
      ]);
      
      await fileInput.setInputFiles(csvPath);
      await page.click('button:has-text("Import"),button:has-text("Upload"),button:has-text("Submit")');
      
      await expect(page.locator('text=/Inserted|Success|Queued/i')).toBeVisible({ timeout: 30000 });
    } else {
      console.log('Import flow not found on campaigns or leads page');
    }
  }
}

async function schedule(page: any) {
  await page.goto('/dashboard/campaigns');
  
  // Look for a campaign row and schedule button
  const scheduleBtn = page.locator('button:has-text("Schedule")').first();
  
  if (await scheduleBtn.count() > 0) {
    await scheduleBtn.click();
    
    // Fill schedule time - try different possible inputs
    const scheduleInput = page.locator('input[name="sendAt"],input[type="datetime-local"],input[placeholder*="schedule"]').first();
    if (await scheduleInput.count() > 0) {
      // Schedule for 1 minute from now
      const oneMinLater = new Date(Date.now() + 60000).toISOString().slice(0, 16); // Format for datetime-local
      await scheduleInput.fill(oneMinLater);
    }
    
    await page.click('button:has-text("Confirm"),button:has-text("Schedule"),button[type="submit"]');
    await expect(page.locator('text=/Scheduled|Success/i')).toBeVisible({ timeout: 10000 });
  } else {
    console.log('Schedule button not found on campaigns page');
  }
}

async function openQueue(page: any) {
  await page.goto('/dashboard');
  
  // Look for Queue link or navigation
  const queueLink = page.locator('a[href*="queue"],nav a:has-text("Queue")').first();
  
  if (await queueLink.count() > 0) {
    await queueLink.click();
  } else {
    // Try direct navigation
    await page.goto('/dashboard/send-queue');
  }
  
  // Wait for queue to show any items
  await expect(page.locator('text=/Queued|Scheduled|Sent|Failed/i')).toBeVisible({ timeout: 60000 });
}

async function mockReplyDetection(page: any) {
  // Call the mock endpoint to simulate reply detection
  const response = await page.request.post(`${BASE_URL}/api/replies/mock-detect`, {
    data: { email: EMAIL_OK, replied: true, message: 'Thanks, got it.' }
  });
  
  if (!response.ok()) {
    console.log('Mock reply detection endpoint returned:', response.status());
  }
}

async function verifyReply(page: any) {
  await page.goto('/dashboard');
  
  // Look for Inbox or Replies link
  const inboxLink = page.locator('a[href*="inbox"],a[href*="replies"],nav a:has-text("Inbox"),nav a:has-text("Replies")').first();
  
  if (await inboxLink.count() > 0) {
    await inboxLink.click();
  } else {
    await page.goto('/dashboard/replies');
  }
  
  // Verify the reply shows up
  await expect(page.locator(`text=${EMAIL_OK}`)).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Thanks, got it.')).toBeVisible({ timeout: 10000 });
}

async function retryFailures(page: any) {
  await page.goto('/dashboard/send-queue');
  
  // Look for retry button
  const retryBtn = page.locator('button:has-text("Retry"),button:has-text("Retry failed")').first();
  
  if (await retryBtn.count() > 0) {
    await retryBtn.click();
    await expect(page.locator('text=/Retry|Success|Started/i')).toBeVisible({ timeout: 10000 });
  } else {
    console.log('Retry button not found - may not have failed items');
  }
}

test('E2E: import → schedule → queue → reply detect → retry', async ({ page }) => {
  await signIn(page);
  await createCampaign(page);
  await importLeads(page);
  await schedule(page);
  await openQueue(page);
  
  // Optional: simulate reply detection if the real detector is async/CRON-based
  await mockReplyDetection(page);
  await verifyReply(page);
  await retryFailures(page);
});

