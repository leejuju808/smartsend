"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function startWarmup(senderId: string) {
  const cookieStore = await cookies();
  const sb = createServerClient(
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

  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify sender belongs to user
  const { data: sender } = await sb
    .from("sender_profiles")
    .select("id")
    .eq("id", senderId)
    .eq("user_id", user.id)
    .single();

  if (!sender) throw new Error("Sender not found or unauthorized");

  // Upsert warmup session
  const { error } = await sb
    .from("warmup_sessions")
    .upsert({
      sender_id: senderId,
      active: true,
    }, {
      onConflict: "sender_id",
    });

  if (error) throw error;
}

export async function stopWarmup(senderId: string) {
  const cookieStore = await cookies();
  const sb = createServerClient(
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

  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify sender belongs to user
  const { data: sender } = await sb
    .from("sender_profiles")
    .select("id")
    .eq("id", senderId)
    .eq("user_id", user.id)
    .single();

  if (!sender) throw new Error("Sender not found or unauthorized");

  // Update warmup session to inactive
  const { error } = await sb
    .from("warmup_sessions")
    .update({ active: false })
    .eq("sender_id", senderId);

  if (error) throw error;
}

