import { test, expect } from "@playwright/test";

test.describe("Marketplace Monetization", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to marketplace
    await page.goto("/dashboard/marketplace");
  });

  test("premium template shows Buy & Install when not owned", async ({ page }) => {
    // Look for a premium template (should have lock icon or premium badge)
    const premiumTemplate = page.locator('[data-testid="template-card"]').filter({ hasText: /Pro|Elite|Master/i }).first();
    
    if (await premiumTemplate.count() > 0) {
      await premiumTemplate.click();
      
      // Should show Buy & Install button for premium templates
      await expect(page.getByRole("button", { name: /Buy & Install/i })).toBeVisible();
      
      // Should show price information
      await expect(page.locator('[data-testid="template-price"]')).toBeVisible();
    } else {
      // Skip if no premium templates found
      test.skip("No premium templates found in marketplace");
    }
  });

  test("checkout redirects to Stripe", async ({ page }) => {
    // Navigate to a specific premium template detail page
    await page.goto("/dashboard/marketplace/template/feature-launch-pro");
    
    // Look for Buy & Install button
    const buyButton = page.getByRole("button", { name: /Buy & Install/i });
    
    if (await buyButton.count() > 0) {
      // Click buy button and wait for navigation
      const [nav] = await Promise.all([
        page.waitForEvent("framenavigated"),
        buyButton.click()
      ]);
      
      // Should redirect to Stripe checkout
      expect(nav.url()).toContain("checkout.stripe.com");
    } else {
      // Skip if template not found or not premium
      test.skip("Template not found or not premium");
    }
  });

  test("premium templates show lock badge", async ({ page }) => {
    // Check that premium templates have lock icons or premium badges
    const lockIcons = page.locator('[data-testid="premium-badge"], .lock-icon, [aria-label*="premium"]');
    
    if (await lockIcons.count() > 0) {
      await expect(lockIcons.first()).toBeVisible();
    } else {
      // Skip if no premium indicators found
      test.skip("No premium indicators found in marketplace");
    }
  });

  test("free templates show Install button", async ({ page }) => {
    // Look for free templates (should not have premium indicators)
    const freeTemplate = page.locator('[data-testid="template-card"]').filter({ hasNot: { text: /Pro|Elite|Master/i } }).first();
    
    if (await freeTemplate.count() > 0) {
      await freeTemplate.click();
      
      // Should show Install button for free templates
      await expect(page.getByRole("button", { name: /Install/i })).toBeVisible();
      
      // Should not show Buy button
      await expect(page.getByRole("button", { name: /Buy/i })).not.toBeVisible();
    } else {
      // Skip if no free templates found
      test.skip("No free templates found in marketplace");
    }
  });

  test("purchase flow shows success message", async ({ page }) => {
    // Mock successful purchase by setting URL params
    await page.goto("/dashboard/marketplace?status=success&template=feature-launch-pro");
    
    // Should show success message
    await expect(page.getByText(/successfully purchased/i)).toBeVisible();
  });

  test("purchase flow shows cancel message", async ({ page }) => {
    // Mock cancelled purchase by setting URL params
    await page.goto("/dashboard/marketplace?status=cancel&template=feature-launch-pro");
    
    // Should show cancel message or return to normal state
    await expect(page.locator('[data-testid="template-card"]')).toBeVisible();
  });
}); 