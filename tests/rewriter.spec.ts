import { test, expect } from '@playwright/test';

test('AI Rewrite panel appears with draft and can insert', async ({ page }) => {
  // Assumes you ran `pnpm qa:rewriter` and the first thread exists in the inbox list.
  await page.goto('http://localhost:3000/inbox');
  await page.waitForSelector('text=AI Rewrite', { timeout: 15000 }).catch(() => {});

  const firstThread = page.locator('a[href^="/inbox/thread/"]').first();
  await firstThread.click();

  await page.getByRole('button', { name: 'AI Rewrite' }).click();

  await expect(page.getByLabel('Subject')).toBeVisible();
  await expect(page.getByLabel('Body')).toBeVisible();

  await page.getByRole('button', { name: 'Insert into composer' }).click();

  const subj = page.getByPlaceholder('Subject');
  const body = page.getByPlaceholder('Write your message…');
  await expect(subj).not.toHaveValue('');
  await expect(body).not.toHaveValue('');
});


