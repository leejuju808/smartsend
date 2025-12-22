import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

const RowSchema = z.object({
  user_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  email: z.string().email(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) return NextResponse.json({ error: "No rows" }, { status: 400 });

    // Validate all rows
    const valid: any[] = [];
    const errors: { index: number; message: string }[] = [];
    rows.forEach((r: any, i: number) => {
      const parsed = RowSchema.safeParse(r);
      if (parsed.success) valid.push(parsed.data);
      else errors.push({ index: i, message: parsed.error.issues.map(x => x.message).join("; ") });
    });

    // Get org_id from campaign if available, or use current org
    const { getCurrentOrgId, getOrgIdFromCampaign } = await import("@/lib/org-helpers");
    let defaultOrgId = await getCurrentOrgId();
    
    // If rows have campaign_id, try to get org_id from the first campaign
    if (valid.length > 0 && valid[0].campaign_id && !defaultOrgId) {
      defaultOrgId = await getOrgIdFromCampaign(valid[0].campaign_id);
    }

    // Chunk inserts to avoid payload limits
    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < valid.length; i += chunkSize) {
      const chunk = valid.slice(i, i + chunkSize).map(row => ({
        ...row,
        org_id: defaultOrgId, // Add org_id to each row
      }));
      const { error } = await supabase.from("leads").upsert(chunk, {
        onConflict: "campaign_id,email",
        ignoreDuplicates: true,
      });
      if (error) throw error;
      inserted += chunk.length;
    }

    return NextResponse.json({ ok: true, received: rows.length, inserted, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "error" }, { status: 500 });
  }
}