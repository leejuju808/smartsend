import { createClient } from "@/utils/supabase/server";
import { SdrTunerForm } from "./SdrTunerForm";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { redirect } from "next/navigation";

export default async function SdrTunerPage() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();

  if (!orgId) {
    redirect("/dashboard");
  }

  const { data: settings } = await supabase
    .from("sdr_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">AI SDR Tuner</h1>
        <p className="text-xs text-muted-foreground">
          Control how aggressive your AI SDR is and when it's allowed to send.
        </p>
      </div>

      <SdrTunerForm initialSettings={settings} orgId={orgId} />
    </div>
  );
}

