import { createClient } from "@/lib/supabase/server";

export async function isSuppressed(args: {
  workspaceId: string;
  email: string;
}): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("email_suppressions")
    .select("id")
    .eq("workspace_id", args.workspaceId)
    .eq("email", args.email.toLowerCase())
    .maybeSingle();

  return !!data;
}







