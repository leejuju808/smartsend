// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Row = Record<string, any>;
type StoVec = number[];

const HOURS = 24;

function zeros(): StoVec {
  return Array.from({ length: HOURS }, () => 0);
}

function decay(vec: StoVec, factor = 0.98): StoVec {
  return vec.map((v) => Math.max(0, Math.round(v * factor)));
}

function argmaxScore(opens: StoVec, clicks: StoVec) {
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < HOURS; i++) {
    const s = (opens[i] || 0) + 2 * (clicks[i] || 0);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  }
  const total =
    opens.reduce((s, v) => s + v, 0) + clicks.reduce((s, v) => s + v, 0);
  const conf = total ? Math.min(1, bestScore / Math.max(1, total)) : 0;
  return { hour: best >= 0 ? best : null, conf };
}

function toLocalHour(utcIso: string, tz?: string | null) {
  try {
    const d = new Date(utcIso);
    if (!tz) return d.getUTCHours();
    const fmt = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: tz,
    });
    const parts = fmt.formatToParts(d);
    const hh = parts.find((p) => p.type === "hour")?.value ?? "0";
    return Number(hh);
  } catch {
    return new Date(utcIso).getUTCHours();
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "webhook";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const sb = (path: string, init?: RequestInit) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...(init ?? {}),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
        ...(init?.headers ?? {}),
      },
    });

  let events: Row[] = [];

  if (mode === "webhook") {
    const body = await req.json().catch(() => ({}));
    if (body?.type === "INSERT" && body?.table === "tracking_events") {
      events = [body.record];
    } else if (body?.event === "open" || body?.event === "click") {
      events = [body];
    } else if (body?.event?.event) {
      events = [body.event];
    } else if (body?.campaign_id && body?.lead_id && body?.created_at) {
      events = [body];
    } else {
      return new Response(
        JSON.stringify({ ok: true, msg: "noop" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
  } else {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const r = await sb(
      `tracking_events?select=*&created_at=gte.${since}&order=created_at.asc`,
    );
    events = await r.json();
  }

  const groups = new Map<string, Row[]>();
  for (const e of events) {
    if (!e?.campaign_id || !e?.lead_id) continue;
    const k = `${e.campaign_id}:${e.lead_id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }

  for (const [keyPair, es] of groups.entries()) {
    const [campaign_id, lead_id] = keyPair.split(":");
    const pr = await sb(
      `lead_sto_profiles?select=*&campaign_id=eq.${campaign_id}&lead_id=eq.${lead_id}`,
    );
    const curRows: Row[] = await pr.json();
    const cur = curRows[0];

    let opens: StoVec = cur?.hist_opens ?? zeros();
    let clicks: StoVec = cur?.hist_clicks ?? zeros();
    let tz: string | null = cur?.tz ?? null;

    if (!tz) {
      const ld = await sb(`leads?select=tz&id=eq.${lead_id}`);
      const ldr: Row[] = await ld.json();
      tz = ldr?.[0]?.tz ?? null;
      if (!tz) {
        const camp = await sb(`campaigns?select=default_tz&id=eq.${campaign_id}`);
        const cj: Row[] = await camp.json();
        tz = cj?.[0]?.default_tz ?? null;
      }
    }

    opens = decay(opens);
    clicks = decay(clicks);

    let lastAt: string | null = cur?.last_observed_at ?? null;
    for (const e of es) {
      if (!e?.created_at) continue;
      const h = toLocalHour(e.created_at, tz ?? undefined);
      if (Number.isNaN(h) || h < 0 || h > 23) continue;
      if (e.event === "open") opens[h] = (opens[h] ?? 0) + 1;
      if (e.event === "click") clicks[h] = (clicks[h] ?? 0) + 1;
      lastAt = e.created_at;
    }

    const { hour, conf } = argmaxScore(opens, clicks);

    const payload = [{
      id: cur?.id,
      campaign_id,
      lead_id,
      tz,
      hist_opens: opens,
      hist_clicks: clicks,
      best_hour: hour,
      best_hour_conf: conf,
      last_observed_at: lastAt,
    }];

    await sb("lead_sto_profiles", {
      method: cur ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: cur ? "resolution=merge-duplicates" : "",
      },
      body: JSON.stringify(payload),
    });
  }

  return new Response(
    JSON.stringify({ ok: true, groups: groups.size }),
    { headers: { "Content-Type": "application/json" } },
  );
});

