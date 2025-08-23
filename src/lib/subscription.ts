import { getSupabaseServer } from "@/lib/supabase/server";

type Profile = {
  id: string;
  email?: string;
  subscription_status?: string | null; // 'free' | 'pro' | etc.
};

/** Returns { userId, status } – status defaults to 'free' */
export async function getSubscriptionStatus(): Promise<{ userId: string | null; status: string }> {
  const supabase = await getSupabaseServer();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { userId: null, status: "free" };

  const { data: prof } = await supabase
    .from("profiles")
    .select("id, subscription_status")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return { userId: user.id, status: (prof?.subscription_status ?? "free") as string };
}

export async function requireProOrRedirect() {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) {
    // kick to sign in; preserve return path
    return { ok: false, redirect: `/login?next=${encodeURIComponent("/dashboard")}` };
  }
  if (status !== "pro") {
    return { ok: false, redirect: "/dashboard/billing?upgrade=1" };
  }
  return { ok: true as const };
} 