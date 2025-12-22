import { redirect } from "next/navigation";
import NudgeManager from "@/app/(settings)/nudges/NudgeManager";
import { createClient } from "@/lib/supabase/server";

export default async function NudgeSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const accountId = profile?.account_id ?? null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Nudge Presets</h1>
        <p className="text-sm text-muted-foreground">
          Create reusable follow-up presets, manage variants, and map classifier outcomes to nudges.
        </p>
      </div>
      {accountId ? (
        <NudgeManager accountId={accountId} />
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          No account assigned to your profile.
        </div>
      )}
    </div>
  );
}

