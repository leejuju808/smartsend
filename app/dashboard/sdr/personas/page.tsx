import { createClient } from "@/utils/supabase/server";
import { PersonasManager } from "./PersonasManager";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { redirect } from "next/navigation";

export default async function PersonasPage() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();

  if (!orgId) {
    redirect("/dashboard");
  }

  const [{ data: personas }, { data: settings }] = await Promise.all([
    supabase
      .from("sdr_personas")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("sdr_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <PersonasManager
        orgId={orgId}
        personas={personas ?? []}
        settings={settings}
      />
    </div>
  );
}

