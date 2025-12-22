"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function openBillingPortal(teamId: string) {
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  );

  // Presence check via RLS
  const { data: tm } = await sb
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .limit(1);
  
  if (!tm?.length) {
    throw new Error("Not authorized");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('supabase.co','functions.supabase.co');
  const res = await fetch(`${supabaseUrl}/createBillingPortal`, {
    method: "POST",
    headers: {
      "x-ss-secret": process.env.BILLING_SECRET!,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ teamId })
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const { url } = await res.json();
  return url as string;
}

