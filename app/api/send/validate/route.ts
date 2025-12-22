/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ValidateReq = {
  workspaceId: string;
  campaignId?: string | null;
  recipients: string[]; // array of raw emails to validate
};

function norm(e: string) { return e.trim().toLowerCase(); }
function isValidEmail(e: string) {
  const v = norm(e);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ValidateReq;
    const { workspaceId, campaignId = null, recipients } = body;

    if (!workspaceId || !Array.isArray(recipients)) {
      return NextResponse.json({ error: "workspaceId and recipients[] are required" }, { status: 400 });
    }

    const supabase = createClient();

    // Load global suppressions for the workspace
    const { data: supGlobal, error: errGlobal } = await supabase
      .from("suppressions")
      .select("email")
      .eq("workspace_id", workspaceId);

    if (errGlobal) {
      return NextResponse.json({ error: errGlobal.message }, { status: 500 });
    }
    const suppressedGlobal = new Set((supGlobal ?? []).map(r => norm(r.email)));

    // Load campaign scoped suppressions if provided
    let suppressedScoped = new Set<string>();
    if (campaignId) {
      const { data: supScoped, error: errScoped } = await supabase
        .from("campaign_suppressions")
        .select("email")
        .eq("campaign_id", campaignId);

      if (errScoped) {
        return NextResponse.json({ error: errScoped.message }, { status: 500 });
      }
      suppressedScoped = new Set((supScoped ?? []).map(r => norm(r.email)));
    }

    // Validate recipients
    const seen = new Set<string>();
    const blocked: { email: string; reason: "invalid" | "suppressed_global" | "suppressed_campaign" | "duplicate_in_payload" }[] = [];
    const finalSendable: string[] = [];

    for (const raw of recipients) {
      if (typeof raw !== "string") continue;
      const email = norm(raw);
      if (!isValidEmail(email)) { blocked.push({ email, reason: "invalid" }); continue; }
      if (seen.has(email)) { blocked.push({ email, reason: "duplicate_in_payload" }); continue; }
      seen.add(email);
      if (suppressedGlobal.has(email)) { blocked.push({ email, reason: "suppressed_global" }); continue; }
      if (campaignId && suppressedScoped.has(email)) { blocked.push({ email, reason: "suppressed_campaign" }); continue; }
      finalSendable.push(email);
    }

    const counts = {
      total: recipients.length,
      invalid: blocked.filter(b => b.reason === "invalid").length,
      duplicate_in_payload: blocked.filter(b => b.reason === "duplicate_in_payload").length,
      suppressed_global: blocked.filter(b => b.reason === "suppressed_global").length,
      suppressed_campaign: blocked.filter(b => b.reason === "suppressed_campaign").length,
      final_sendable: finalSendable.length
    };

    return NextResponse.json({
      ok: true,
      counts,
      blocked: blocked.slice(0, 500), // cap payload
      finalSendable
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}