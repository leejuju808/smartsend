import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function RequirePro({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("subscription_status")
    .eq("id", user.id)
    .single();

  if (error) {
    redirect("/dashboard/billing?reason=profile_missing");
  }

  if ((profile?.subscription_status ?? "free") !== "pro") {
    redirect("/dashboard/billing?reason=upgrade_required");
  }

  return <>{children}</>;
}

