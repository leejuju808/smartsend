import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type WarmupSetting = {
  account_id: string;
  enabled: boolean;
  daily_limit: number;
  ramp_days: number;
  auto_reply: boolean;
  start_date: string;
};

const subjects = [
  "Checking connection",
  "Just testing deliverability",
  "Quick warm-up ping",
  "Inbox test",
  "Friendly hello from SmartSend",
  "Testing domain health",
];

const bodies = [
  "This is a warm-up email to keep deliverability strong.",
  "SmartSend AI warm-up message — building reputation automatically.",
  "Another warm-up ping: confirming inbox reach.",
  "Automated warm-up — no action needed, thanks!",
];

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function toJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async () => {
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!sbUrl || !key) {
    return toJsonResponse({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const baseHeaders: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
  };

  try {
    const settingsResp = await fetch(`${sbUrl}/rest/v1/warmup_settings?select=*`, {
      headers: baseHeaders,
    });

    if (!settingsResp.ok) {
      return toJsonResponse({ ok: false, error: await settingsResp.text() }, 500);
    }

    const raw = (await settingsResp.json()) as WarmupSetting[] | null;
    const enabledSettings = (raw ?? []).filter((row) => row.enabled);

    if (!enabledSettings.length) {
      return toJsonResponse({ ok: true, processed: [], message: "No warm-up accounts enabled" });
    }

    const processed: Array<{
      account_id: string;
      attempted: number;
      sent: number;
      details: string;
    }> = [];

    const errors: Array<{ account_id: string; error: string }> = [];
    const nowIso = new Date().toISOString();

    for (const acc of enabledSettings) {
      const peers = enabledSettings.filter((p) => p.account_id !== acc.account_id);
      if (!peers.length) {
        processed.push({
          account_id: acc.account_id,
          attempted: 0,
          sent: 0,
          details: "skipped_no_peers",
        });
        continue;
      }

      const start = acc.start_date ? new Date(acc.start_date) : null;
      if (!start || Number.isNaN(start.getTime())) {
        errors.push({ account_id: acc.account_id, error: "invalid_start_date" });
        continue;
      }

      const daysRunning = Math.floor((Date.now() - start.getTime()) / 86_400_000);
      if (daysRunning < 0) {
        processed.push({
          account_id: acc.account_id,
          attempted: 0,
          sent: 0,
          details: "skipped_before_start",
        });
        continue;
      }

      const rampDenominator = Math.max(acc.ramp_days || 1, 1);
      const scaled = Math.floor((daysRunning / rampDenominator) * acc.daily_limit);
      const maxToday = Math.min(acc.daily_limit, Math.max(5, scaled));

      if (maxToday <= 0) {
        processed.push({
          account_id: acc.account_id,
          attempted: 0,
          sent: 0,
          details: "skipped_zero_cap",
        });
        continue;
      }

      const sendTarget = Math.max(1, Math.ceil(Math.random() * maxToday));
      let sentCount = 0;

      for (let i = 0; i < sendTarget; i += 1) {
        const peer = pickRandom(peers);
        const subject = pickRandom(subjects);
        const body = pickRandom(bodies);

        const sendResp = await fetch(`${sbUrl}/rest/v1/warmup_logs`, {
          method: "POST",
          headers: { ...baseHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: acc.account_id,
            peer_account_id: peer.account_id,
            subject,
            body,
            status: "sent",
          }),
        });

        if (!sendResp.ok) {
          errors.push({ account_id: acc.account_id, error: await sendResp.text() });
          continue;
        }

        sentCount += 1;

        if (acc.auto_reply !== false) {
          if (Math.random() < 0.7) {
            const openResp = await fetch(`${sbUrl}/rest/v1/warmup_logs`, {
              method: "POST",
              headers: { ...baseHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({
                account_id: acc.account_id,
                peer_account_id: peer.account_id,
                status: "opened",
                event_at: nowIso,
              }),
            });
            if (!openResp.ok) {
              errors.push({ account_id: acc.account_id, error: await openResp.text() });
            }
          }

          if (Math.random() < 0.3) {
            const replyResp = await fetch(`${sbUrl}/rest/v1/warmup_logs`, {
              method: "POST",
              headers: { ...baseHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({
                account_id: peer.account_id,
                peer_account_id: acc.account_id,
                status: "replied",
                event_at: nowIso,
              }),
            });
            if (!replyResp.ok) {
              errors.push({ account_id: acc.account_id, error: await replyResp.text() });
            }
          }
        }
      }

      const patchResp = await fetch(`${sbUrl}/rest/v1/warmup_settings?account_id=eq.${acc.account_id}`, {
        method: "PATCH",
        headers: { ...baseHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ last_run: nowIso }),
      });

      if (!patchResp.ok) {
        errors.push({ account_id: acc.account_id, error: await patchResp.text() });
      }

      processed.push({
        account_id: acc.account_id,
        attempted: sendTarget,
        sent: sentCount,
        details: sentCount ? "completed" : "no_sent_rows",
      });
    }

    return toJsonResponse({
      ok: errors.length === 0,
      processed,
      errors,
    });
  } catch (error) {
    return toJsonResponse({ ok: false, error: (error as Error).message }, 500);
  }
});



