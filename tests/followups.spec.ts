import { test, expect } from "@playwright/test";

test.describe("Follow-Ups UI", () => {
  test("saves settings and shows toast", async ({ page }) => {
    await page.route("**/api/campaign/*/followup", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          json: {
            rule: {
              enabled: true,
              labels: ["human_reply", "question", "positive", "neutral"],
              hours_wait: 48,
              max_nudges: 2,
              auto_send: false,
              tone: "professional",
              length: "short",
              cta: "Open to a 7-min chat?",
            },
          },
        });
      }
      if (route.request().method() === "POST") {
        const body = await route.request().postDataJSON();
        expect(body.enabled).toBeTypeOf("boolean");
        expect(Array.isArray(body.labels)).toBeTruthy();
        expect(typeof body.hours_wait).toBe("number");
        return route.fulfill({ json: { ok: true, rule: body } });
      }
      return route.continue();
    });

    await page.goto("/campaigns/00000000-0000-0000-0000-000000000000/settings/followups");

    await page.getByLabel("Wait (hours)").fill("12");
    await page.getByText("Enable follow-ups").click();
    await page.getByText("Enable follow-ups").click();

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Follow-up rules saved")).toBeVisible();
  });

  test("thread banner shows queued + eligible states", async ({ page }) => {
    let call = 0;
    await page.route("**/api/thread/*/nudge-state", async (route) => {
      call += 1;
      if (call === 1) {
        return route.fulfill({
          json: {
            needs: true,
            queued_at: new Date().toISOString(),
            run_at: new Date(Date.now() + 10 * 60e3).toISOString(),
            nudge_no: 1,
          },
        });
      }
      return route.fulfill({
        json: {
          needs: true,
          queued_at: null,
          run_at: new Date(Date.now() + 3 * 3600e3).toISOString(),
          nudge_no: null,
          in_hours: 3,
        },
      });
    });

    await page.goto("/threads/11111111-1111-1111-1111-111111111111");
    await expect(page.getByText("Follow-up scheduled for")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Eligible for follow-up in 3h")).toBeVisible();
  });
});


