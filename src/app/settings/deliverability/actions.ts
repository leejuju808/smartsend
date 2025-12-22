"use server";

import { createClient } from "@/utils/supabase/server";
import { z } from "zod";

const Schema = z.object({
  domain: z.string().min(1),
  teamId: z.string().uuid(),
});

export async function verifyDomain(_: any, formData: FormData) {
  const input = Schema.parse({
    domain: formData.get("domain"),
    teamId: formData.get("teamId"),
  });

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Verify user has access to this team
  const { data: membership } = await sb
    .from("team_members")
    .select("role")
    .eq("team_id", input.teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    throw new Error("Unauthorized: Not a member of this team");
  }

  // Call edge function
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const functionUrl = supabaseUrl.replace(/\.supabase\.co/, ".functions.supabase.co");
  
  const res = await fetch(`${functionUrl}/domain-verify`, {
    method: "POST",
    headers: {
      "x-ss-secret": process.env.DOMAIN_SECRET!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      domain: input.domain.toLowerCase(),
      team_id: input.teamId,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Verification failed: ${errorText}`);
  }

  return await res.json();
}

