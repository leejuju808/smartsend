import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(){
  const s = createRouteHandlerClient({ cookies });
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ subscription:null, usage:null });

  const { data: sub } = await s.from("user_subscriptions").select("*").eq("user_id", user.id).maybeSingle();
  const { data: usage } = await s.rpc("get_user_usage", { p_user: user.id });
  const { data: limits } = await s.from("plan_limits").select("*").eq("plan", usage?.plan || 'free').single();

  return NextResponse.json({ subscription: sub ?? { plan: 'free', status: 'active' }, usage: { ...usage, limits } });
}

