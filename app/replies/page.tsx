import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { RepliesInboxClient } from "@/components/replies/inbox-client";

export default async function RepliesPage() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const workspaceId = user.app_metadata?.workspace_id as string | undefined;
  if (!workspaceId) {
    redirect("/onboarding");
  }

  return <RepliesInboxClient />;
}
