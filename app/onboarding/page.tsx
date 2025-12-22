import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function OnboardingEntry() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get user's workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    // No workspace found, redirect to workspace creation
    redirect("/onboarding/workspace");
  }

  const workspaceId = membership.workspace_id;

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("onboarding_step")
    .eq("id", workspaceId)
    .single();

  const step = workspace?.onboarding_step ?? "welcome";

  // Route based on onboarding step
  if (step === "welcome" || step === null) redirect("/onboarding/workspace");
  if (step === "workspace") redirect("/onboarding/workspace");
  if (step === "connect_email") redirect("/onboarding/connect-email");
  if (step === "first_upload") redirect("/onboarding/upload");
  if (step === "map_columns") redirect("/onboarding/map-columns");
  if (step === "import_preview") redirect("/onboarding/import-preview");
  if (step === "finished") redirect("/dashboard");

  // Default fallback
  redirect("/dashboard");
}
