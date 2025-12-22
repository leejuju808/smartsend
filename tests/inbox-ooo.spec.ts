import { test, expect } from '@playwright/test';

test('@inbox Inbox shows OOO chip and label badges', async ({ page }) => {
  await page.goto('http://localhost:3000/inbox');

  await page.waitForSelector('text=Labeled', { timeout: 15_000 });

  const oooChip = page.locator('text=OOO');
  await expect(oooChip.first()).toBeVisible();

  await expect(page.locator('text=Human').first()).toBeVisible();
  await expect(page.locator('text=Positive').first()).toBeVisible();
  await expect(page.locator('text=Bounce').first()).toBeVisible();

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('text=No threads match your filters.')).toBeVisible();

  await page.getByRole('button', { name: 'out of office' }).click();
  await expect(oooChip.first()).toBeVisible();
});

