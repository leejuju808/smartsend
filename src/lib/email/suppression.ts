import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

export async function isSuppressed(email: string): Promise<boolean> {
  const { data } = await supabase
    .from("suppression_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  return !!data;
}

export async function addSuppression(email: string, source = "api", reason = "user_unsubscribed") {
  await supabase.from("suppression_list").upsert({ 
    email: email.toLowerCase(), 
    source, 
    reason 
  });
}

export async function addWorkspaceSuppression(
  workspaceId: string, 
  email: string, 
  source = "api", 
  reason = "user_unsubscribed"
) {
  // Add to global suppression list
  await addSuppression(email, source, reason);
  
  // Also add to workspace-specific suppressions if needed
  // This maintains compatibility with existing system
} 