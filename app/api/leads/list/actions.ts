"use server";

import { createClient } from "@/utils/supabase/server";
import { filterLeadsBySegment } from "@/utils/segments/filter";

export type LeadRow = {
  id: string;
  account_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  city: string | null;
  country: string | null;
  tags: string[] | null;
  email_status: "active" | "replied" | "unsubscribed" | "bounced" | null;
  last_reply_at: string | null;
  last_reply_kind: string | null;
  created_at: string;
};

export type LeadListFilters = {
  status?: "all" | "active" | "replied" | "unsubscribed" | "bounced";
  search?: string | null;
  segmentId?: string | null;
};

export async function listLeads(
  accountId: string,
  filters?: LeadListFilters
): Promise<LeadRow[]> {
  const supabase = createClient();
  const { status = "all", search, segmentId } = filters || {};

  // If a segment is selected, use filterLeadsBySegment to get lead IDs,
  // then pull full rows from leads table.
  if (segmentId) {
    const segmented = await filterLeadsBySegment(accountId, segmentId);
    const ids = (segmented as any[])
      .map((l) => l.id as string)
      .filter(Boolean);

    if (ids.length === 0) {
      return [];
    }

    let query = supabase
      .from("leads")
      .select(
        `
        id,
        account_id,
        email,
        first_name,
        last_name,
        company,
        title,
        city,
        country,
        tags,
        email_status,
        last_reply_at,
        last_reply_kind,
        created_at
      `
      )
      .eq("account_id", accountId)
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(500);

    if (status !== "all") {
      query = query.eq("email_status", status);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(
        `email.ilike.${q},company.ilike.${q},title.ilike.${q},first_name.ilike.${q},last_name.ilike.${q}`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as LeadRow[];
  }

  // Fallback: no segment filter → original behavior
  let query = supabase
    .from("leads")
    .select(
      `
      id,
      account_id,
      email,
      first_name,
      last_name,
      company,
      title,
      city,
      country,
      tags,
      email_status,
      last_reply_at,
      last_reply_kind,
      created_at
    `
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (status !== "all") {
    query = query.eq("email_status", status);
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(
      `email.ilike.${q},company.ilike.${q},title.ilike.${q},first_name.ilike.${q},last_name.ilike.${q}`
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as LeadRow[];
}

