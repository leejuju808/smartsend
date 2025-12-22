import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Contacts Import E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to contacts page
    await page.goto('/dashboard/contacts');
  });

  test('should display contacts page with import button', async ({ page }) => {
    // Check if the page loads
    await expect(page.locator('h1')).toContainText('Contacts');
    await expect(page.locator('button')).toContainText('Import CSV');
  });

  test('should open import wizard when import button is clicked', async ({ page }) => {
    // Click import button
    await page.click('button:has-text("Import CSV")');
    
    // Check if wizard opens
    await expect(page.locator('h2')).toContainText('Import Contacts');
    await expect(page.locator('text=Upload CSV')).toBeVisible();
  });

  test('should handle file upload and field mapping', async ({ page }) => {
    // Open import wizard
    await page.click('button:has-text("Import CSV")');
    
    // Upload sample CSV file
    const filePath = path.join(__dirname, '../../fixtures/sample_contacts.csv');
    await page.setInputFiles('input[type="file"]', filePath);
    
    // Wait for upload to complete and move to next step
    await page.waitForTimeout(2000);
    
    // Check if we're on the mapping step
    await expect(page.locator('text=Map Fields')).toBeVisible();
    
    // Verify email field is auto-mapped
    const emailSelect = page.locator('select').first();
    await expect(emailSelect).toHaveValue('email');
  });

  test('should show sample data preview', async ({ page }) => {
    // Open import wizard
    await page.click('button:has-text("Import CSV")');
    
    // Upload sample CSV file
    const filePath = path.join(__dirname, '../../fixtures/sample_contacts.csv');
    await page.setInputFiles('input[type="file"]', filePath);
    
    // Wait for upload and preview
    await page.waitForTimeout(2000);
    
    // Check if preview table shows data
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('td')).toContainText('john.doe@example.com');
  });

  test('should complete import workflow', async ({ page }) => {
    // Open import wizard
    await page.click('button:has-text("Import CSV")');
    
    // Upload sample CSV file
    const filePath = path.join(__dirname, '../../fixtures/sample_contacts.csv');
    await page.setInputFiles('input[type="file"]', filePath);
    
    // Wait for upload
    await page.waitForTimeout(2000);
    
    // Go to next step (mapping)
    await page.click('button:has-text("Next")');
    
    // Go to final step (commit)
    await page.click('button:has-text("Next")');
    
    // Check if commit step is visible
    await expect(page.locator('text=Import Settings')).toBeVisible();
    
    // Start import
    await page.click('button:has-text("Start Import")');
    
    // Check if import status is shown
    await expect(page.locator('text=Starting import...')).toBeVisible();
  });
}); 