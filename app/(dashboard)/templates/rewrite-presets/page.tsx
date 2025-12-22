import { createClient } from "@/utils/supabase/server";
import { RewritePresetManager } from "@/components/templates/rewrite-preset-manager";
import { redirect } from "next/navigation";

export default async function RewritePresetsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get account_id from account_members (standard pattern)
  const { data: membership, error } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !membership?.account_id) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">No active account found. Please set up your account first.</p>
      </div>
    );
  }

  const accountId = membership.account_id;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <RewritePresetManager accountId={accountId} ownerId={user.id} />
    </div>
  );
}













