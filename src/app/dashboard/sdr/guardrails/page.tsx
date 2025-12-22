import { createClient } from "@/utils/supabase/server";
import { GuardrailCenter } from "./GuardrailCenter";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { redirect } from "next/navigation";

export default async function GuardrailsPage() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();

  if (!orgId) {
    redirect("/dashboard");
  }

  const [{ data: events }, { data: settings }] = await Promise.all([
    supabase
      .from("sdr_guardrail_events")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("sdr_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  return (
    <GuardrailCenter
      orgId={orgId}
      initialEvents={events ?? []}
      settings={settings}
    />
  );
}

