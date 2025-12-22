import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }
  return d;
}

function toTZ(dateUTC: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(dateUTC).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    M: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    m: Number(parts.minute),
  };
}

function fromTZ(y: number, M: number, d: number, h: number, m: number, tz: string) {
  const asIf = new Date(Date.UTC(y, M - 1, d, h, m));
  const z = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(asIf);
  const off = z.find((p) => p.type === "timeZoneName")?.value ?? "UTC+0";
  const match = off.match(/UTC([+-])(\d{1,2})(?::?(\d{2}))?/i);
  let minutes = 0;
  if (match) {
    const sign = match[1] === "-" ? -1 : 1;
    const hours = parseInt(match[2] ?? "0", 10);
    const mins = parseInt(match[3] ?? "0", 10);
    minutes = sign * (hours * 60 + mins);
  }
  return new Date(asIf.getTime() - minutes * 60_000);
}

type PickRequest = {
  owner_id: string;
  label: string;
  role_hint?: string | null;
  region?: string | null;
  prospect_tz: string;
  last_touch_at?: string | null;
};

type PickResponse =
  | {
    variant_id: string;
    run_at_utc: string;
    run_at_local: { y: number; M: number; d: number; h: number; m: number; tz: string };
    business_days_only: boolean;
  }
  | { error: string };

Deno.serve(async (req) => {
  try {
    const body = await req.json() as PickRequest;
    const { owner_id, label, role_hint, region, prospect_tz, last_touch_at } = body;

    if (!owner_id || !label || !prospect_tz) {
      return new Response("Missing params", { status: 400 });
    }

    const { data: pick, error } = await supabase.rpc("pick_timing_ucb", {
      owner: owner_id,
      label_in: label,
      role_in: role_hint ?? null,
      region_in: region ?? null,
      c: 0.7,
    }).single();

    if (error || !pick) {
      return new Response("No timing variants available", { status: 404 });
    }

    const last = last_touch_at ? new Date(last_touch_at) : new Date();
    const base = pick.business_days_only
      ? addBusinessDays(last, pick.day_delay)
      : new Date(last.getTime() + pick.day_delay * 86_400_000);

    const { y, M, d } = toTZ(base, prospect_tz);
    const runAtUTC = fromTZ(y, M, d, pick.hour_local, pick.minute_local, prospect_tz);

    const payload: PickResponse = {
      variant_id: pick.variant_id,
      run_at_utc: runAtUTC.toISOString(),
      run_at_local: {
        y,
        M,
        d,
        h: pick.hour_local,
        m: pick.minute_local,
        tz: prospect_tz,
      },
      business_days_only: pick.business_days_only,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const payload: PickResponse = { error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let added = 0;

  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      added += 1;
    }
  }

  return d;
}

function toTZ(dateUTC: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(dateUTC).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    M: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    m: Number(parts.minute)
  };
}

function fromTZ(y: number, M: number, d: number, h: number, m: number, tz: string) {
  const asIf = new Date(Date.UTC(y, M - 1, d, h, m));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset"
  }).formatToParts(asIf);
  const offsetLabel = parts.find((p) => p.type === "timeZoneName")?.value ?? "UTC+0";
  const matched = offsetLabel.match(/UTC([+-])(\d{1,2})(?::?(\d{2}))?/i);

  let offsetMinutes = 0;
  if (matched) {
    const sign = matched[1] === "-" ? -1 : 1;
    const hours = parseInt(matched[2] ?? "0", 10);
    const minutes = parseInt(matched[3] ?? "0", 10);
    offsetMinutes = sign * (hours * 60 + minutes);
  }

  return new Date(asIf.getTime() - offsetMinutes * 60000);
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const {
      owner_id,
      label,
      role_hint,
      region,
      prospect_tz,
      last_touch_at
    } = payload as Record<string, any>;

    if (!owner_id || !label) {
      return new Response("Missing params", { status: 400 });
    }

    const timezone = prospect_tz || "America/New_York";

    const { data: pick, error } = await supabase
      .rpc("pick_timing_ucb", {
        owner: owner_id,
        label_in: label,
        role_in: role_hint ?? null,
        region_in: region ?? null,
        c: 0.7
      })
      .single();

    if (error || !pick) {
      return new Response("No timing variants available", { status: 404 });
    }

    const last = last_touch_at ? new Date(last_touch_at) : new Date();
    const base = pick.business_days_only
      ? addBusinessDays(last, pick.day_delay)
      : new Date(last.getTime() + pick.day_delay * 86400000);

    const { y, M, d } = toTZ(base, timezone);
    const runAtUTC = fromTZ(y, M, d, pick.hour_local, pick.minute_local, timezone);

    return new Response(
      JSON.stringify({
        variant_id: pick.variant_id,
        run_at_utc: runAtUTC.toISOString(),
        run_at_local: {
          y,
          M,
          d,
          h: pick.hour_local,
          m: pick.minute_local,
          tz: timezone
        },
        business_days_only: pick.business_days_only
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown error" }),
      {
        headers: { "content-type": "application/json" },
        status: 500
      }
    );
  }
});


