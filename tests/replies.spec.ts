import { test, expect } from "@playwright/test";

test.describe("Replies flows", () => {
  test("Inbound marks replied and cancels followups", async ({ request }) => {
    const createRes = await request.post("/api/test/create-thread");
    expect(createRes.ok()).toBeTruthy();
    const { thread_id: threadId } = await createRes.json();

    await request.post("/api/test/queue-followup", { data: { thread_id: threadId } });

    const inboundRes = await request.post("/api/test/inbound", {
      data: { thread_id: threadId, text: "Thanks, let's talk next week." },
    });
    expect(inboundRes.ok()).toBeTruthy();

    const statusRes = await request.get(`/api/test/thread-status?thread_id=${threadId}`);
    expect(statusRes.ok()).toBeTruthy();
    const status = await statusRes.json();

    expect(status.pending_count).toBe(0);
    expect(status.reply_type).toBeTruthy();
  });

  test("Composer override label + mark replied", async ({ page, request }) => {
    const createRes = await request.post("/api/test/create-thread");
    expect(createRes.ok()).toBeTruthy();
    const { thread_id: threadId } = await createRes.json();

    await page.goto(`/threads/${threadId}`);
    await page.click('button:has-text("Question")');
    await page.click('button:has-text("Mark replied")');
    await expect(page.locator('text=Marked as replied — follow-ups stopped')).toBeVisible();
  });
});







