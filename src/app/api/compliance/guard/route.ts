import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type GuardConfigRow = {
  owner_id: string;
  min_words: number;
  max_words: number;
  require_cta: boolean;
  require_unsubscribe_line: boolean;
  require_postal_address: boolean;
  forbid_phrases: string[] | null;
  block_caps_ratio: number;
  max_links: number;
  my_meeting_link: string | null;
  org_address: string | null;
};

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let { data: config, error } = await supabase
      .from("nudge_guardrails")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle<GuardConfigRow>();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (!config) {
      const { data: inserted, error: insertError } = await supabase
        .from("nudge_guardrails")
        .insert([{ owner_id: user.id }])
        .select("*")
        .single<GuardConfigRow>();

      if (insertError || !inserted) {
        throw insertError ?? new Error("Failed to seed guard config");
      }
      config = inserted;
    }

    const { data: audit, error: auditError } = await supabase
      .from("nudge_guard_audit")
      .select("id, created_at, severity, rule, message, draft_before, draft_after")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (auditError) {
      throw auditError;
    }

    return NextResponse.json({
      config,
      audit: audit ?? [],
    });
  } catch (err: any) {
    console.error("compliance guard GET failed", err);
    const message = err?.message ?? "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const sanitizeNumber = (value: unknown, fallback: number, opts: { min?: number; max?: number } = {}) => {
      const parsed = Number(value);
      const safe = Number.isFinite(parsed) ? parsed : fallback;
      const min = opts.min ?? Number.NEGATIVE_INFINITY;
      const max = opts.max ?? Number.POSITIVE_INFINITY;
      return Math.min(Math.max(safe, min), max);
    };

    const forbidPhrases: string[] = Array.isArray(body.forbid_phrases)
      ? body.forbid_phrases
          .map((p: unknown) => (typeof p === "string" ? p.trim() : ""))
          .filter((p: string) => p.length > 0)
      : [];

    const payload = {
      owner_id: user.id,
      min_words: sanitizeNumber(body.min_words, 60, { min: 10, max: 500 }),
      max_words: sanitizeNumber(body.max_words, 130, { min: 40, max: 800 }),
      require_cta: Boolean(body.require_cta ?? true),
      require_unsubscribe_line: Boolean(body.require_unsubscribe_line ?? true),
      require_postal_address: Boolean(body.require_postal_address ?? true),
      forbid_phrases: forbidPhrases,
      block_caps_ratio: sanitizeNumber(body.block_caps_ratio, 0.35, { min: 0, max: 1 }),
      max_links: sanitizeNumber(body.max_links, 3, { min: 0, max: 10 }),
      my_meeting_link: typeof body.my_meeting_link === "string" ? body.my_meeting_link.trim() || null : null,
      org_address: typeof body.org_address === "string" ? body.org_address.trim() || null : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("nudge_guardrails")
      .upsert(payload, { onConflict: "owner_id" })
      .select("*")
      .single<GuardConfigRow>();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, config: data });
  } catch (err: any) {
    console.error("compliance guard POST failed", err);
    const message = err?.message ?? "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

















