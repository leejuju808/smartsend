"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";

const LeadSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
});

const PayloadSchema = z.object({
  campaignId: z.string().uuid(),
  leads: z.array(LeadSchema).min(1).max(5000),
});

export async function insertLeads(formData: FormData) {
  const json = formData.get("payload");
  if (!json || typeof json !== "string") throw new Error("No payload");

  const { campaignId, leads } = PayloadSchema.parse(JSON.parse(json));

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  );

  // auth
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("Not authenticated");

  // fetch existing emails for dedupe (per-campaign)
  const { data: existing, error: existErr } = await supabase
    .from("campaign_leads")
    .select("email")
    .eq("campaign_id", campaignId);
  if (existErr) throw existErr;

  const existingSet = new Set((existing ?? []).map(r => r.email.toLowerCase().trim()));
  const incomingUnique = new Map<string, z.infer<typeof LeadSchema>>();

  for (const l of leads) {
    const key = l.email.toLowerCase().trim();
    if (!existingSet.has(key) && !incomingUnique.has(key)) incomingUnique.set(key, l);
  }
  const toInsert = Array.from(incomingUnique.values());

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: leads.length, reason: "All duplicates" };
  }

  const rows = toInsert.map(l => ({
    user_id: user.id,
    campaign_id: campaignId,
    email: l.email.trim(),
    first_name: l.first_name?.trim() || null,
    company: l.company?.trim() || null,
    title: l.title?.trim() || null,
  }));

  const { error: insErr, data: insertedData } = await supabase.from("campaign_leads").insert(rows).select("id, email");
  if (insErr) throw insErr;

  // Trigger verification for inserted leads
  if (insertedData && insertedData.length > 0 && process.env.LEAD_VERIFY_SECRET) {
    const leadsForVerify = insertedData.map((l: any) => ({ id: l.id, email: l.email }));
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const functionsUrl = supabaseUrl.replace(/\.supabase\.co/, ".functions.supabase.co");
    
    try {
      await fetch(`${functionsUrl}/lead-verify`, {
        method: "POST",
        headers: {
          "x-ss-secret": process.env.LEAD_VERIFY_SECRET!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campaignId, leads: leadsForVerify }),
      });
      // Fire and forget - don't block on verification
    } catch (err) {
      // Silently fail verification - not critical for import
      console.warn("Lead verification failed:", err);
    }
  }

  return { inserted: rows.length, skipped: leads.length - rows.length };
}

