// app/api/import-leads-csv/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const LeadSchema = z.object({
  workspace_id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().optional().default(""),
  company: z.string().optional().default(""),
  title: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  meta: z.record(z.any()).optional().default({}),
});

const PayloadSchema = z.object({
  workspace_id: z.string().uuid(),
  // rows come from the client after header mapping
  rows: z.array(
    z.object({
      email: z.string().email(),
      name: z.string().optional(),
      company: z.string().optional(),
      title: z.string().optional(),
      phone: z.string().optional(),
      tags: z.array(z.string()).optional(),
      meta: z.record(z.any()).optional(),
    })
  ),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = PayloadSchema.parse(json);

    // Check limit BEFORE insert
    const limitRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'}/api/limits/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: payload.workspace_id,
        kind: "leads",
        delta: payload.rows.length,
      }),
    });

    const limitJson = await limitRes.json();
    if (limitJson.status === "blocked") {
      return NextResponse.json(
        {
          ok: false,
          error: "leads_limit",
          message: "You've hit the maximum of 10,000 leads for this workspace.",
        },
        { status: 403 }
      );
    }

    // validate each row with workspace_id mixed in
    const toUpsert = payload.rows.map((r) =>
      LeadSchema.parse({ workspace_id: payload.workspace_id, ...r })
    );

    // Upsert by (workspace_id, email) unique constraint
    const { data, error } = await supabaseAdmin
      .from("leads")
      .upsert(toUpsert, { onConflict: "workspace_id,email" })
      .select("id,email");

    if (error) {
      console.error("Import upsert error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Log activity - get first user from workspace_members as actor
    const { data: member } = await supabaseAdmin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", payload.workspace_id)
      .limit(1)
      .maybeSingle();

    await supabaseAdmin.from("workspace_activity").insert({
      workspace_id: payload.workspace_id,
      actor_id: member?.user_id ?? null,
      event_type: "leads_imported",
      description: `Imported ${data?.length ?? 0} leads`,
      metadata: { count: data?.length ?? 0, source: "csv" },
    }).catch((err) => {
      console.error("Failed to log leads import activity:", err);
    });

    return NextResponse.json({ ok: true, count: data?.length ?? 0 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e.message ?? "Invalid payload" }, { status: 400 });
  }
}
