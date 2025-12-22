// lib/data/leads.ts
"use server";

import { getServerSupabase } from "@/lib/supabase/server";

export type LeadStatus = "new" | "queued" | "sent" | "bounced" | "failed" | "retrying" | "replied" | "paused" | "all";

export type LeadsQuery = {
  status?: LeadStatus;      // "all" means no filter
  page?: number;            // 1-based
  perPage?: number;         // default 20
  campaignId?: string;      // optional filter
  search?: string;          // optional email contains
};

export async function fetchLeads(q: LeadsQuery) {
  const supabase = getServerSupabase();
  const page = Math.max(1, q.page ?? 1);
  const perPage = Math.min(100, Math.max(5, q.perPage ?? 20));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let base = supabase.from("leads").select("*", { count: "exact" });

  if (q.campaignId) base = base.eq("campaign_id", q.campaignId);
  if (q.status && q.status !== "all") base = base.eq("status", q.status);
  if (q.search) base = base.ilike("email", `%${q.search}%`);

  // newest first
  base = base.order("updated_at", { ascending: false }).range(from, to);

  const { data, count, error } = await base;
  if (error) throw new Error(error.message);

  return {
    leads: data ?? [],
    page,
    perPage,
    total: count ?? 0,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / perPage)),
  };
}