import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaybookForm from "../_components/playbook-form";

export default async function EditPlaybookPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: playbook } = await supabase
    .from("ai_sdr_playbooks")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!playbook) {
    redirect("/dashboard/ai-sdr/playbooks");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit Playbook</h1>
        <p className="text-sm text-muted-foreground">
          Update your playbook settings.
        </p>
      </div>

      <PlaybookForm userId={user.id} playbook={playbook} />
    </div>
  );
}


