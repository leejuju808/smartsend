import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaybookForm from "../_components/playbook-form";

export default async function NewPlaybookPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Playbook</h1>
        <p className="text-sm text-muted-foreground">
          Define how Autopilot should talk to each persona and campaign.
        </p>
      </div>

      <PlaybookForm userId={user.id} />
    </div>
  );
}


