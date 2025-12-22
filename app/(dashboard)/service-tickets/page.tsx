// Block 92000 — SmartSend Roofing Service Tickets Board v1
// Kanban board for managing service tickets

import { getServerSupabase } from "@/lib/supabase/server";
import { ServiceTicketsBoard } from "./components/ServiceTicketsBoard";

export default async function ServiceTicketsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-red-500">Unauthorized</p>
      </div>
    );
  }

  // Get user's workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const workspaceId = membership?.workspace_id;

  return (
    <div className="h-full">
      <ServiceTicketsBoard workspaceId={workspaceId || ""} />
    </div>
  );
}



























