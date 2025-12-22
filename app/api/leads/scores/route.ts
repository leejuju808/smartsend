import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lead_scores")
    .select("lead_id, score, updated_at")
    .order("score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const leadIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.lead_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const leadMap = new Map<
    string,
    { first_name: string | null; last_name: string | null; email: string | null; company: string | null }
  >();

  if (leadIds.length > 0) {
    const { data: leadRows, error: leadError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, email, company")
      .in("id", leadIds);

    if (leadError) {
      console.error("Failed to resolve leads for score leaderboard:", leadError);
    } else {
      for (const lead of leadRows ?? []) {
        if (lead.id) {
          leadMap.set(lead.id, {
            first_name: lead.first_name,
            last_name: lead.last_name,
            email: lead.email,
            company: lead.company,
          });
        }
      }
    }
  }

  const payload =
    data?.map((row) => {
      const lead = row.lead_id ? leadMap.get(row.lead_id) : undefined;
      const fullName = lead
        ? [lead.first_name, lead.last_name].filter(Boolean).join(" ")
        : "";
      return {
        lead_id: row.lead_id,
        score: row.score,
        updated_at: row.updated_at,
        name: fullName || lead?.email || null,
        company: lead?.company ?? null,
      };
    }) ?? [];

  return NextResponse.json(payload);
}


