"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function getTeamPlan(teamId: string) {
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  );
  
  const { data } = await sb
    .from("v_team_plan")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();
  
  return data;
}

export async function getMonthUsage(teamId: string) {
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  );
  
  const { data } = await sb
    .from("v_usage_month")
    .select("metric, qty")
    .eq("team_id", teamId)
    .order("month", { ascending: false })
    .limit(6);
  
  return data ?? [];
}

export function used(usage: {metric: string, qty: number}[], metric: string): number {
  return usage.find(u => u.metric === metric)?.qty ?? 0;
}
