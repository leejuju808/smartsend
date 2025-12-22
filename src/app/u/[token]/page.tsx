import { createServiceClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function UnsubscribePage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createServiceClient();
  
  const { data: tokenRow } = await supabase
    .from("unsubscribe_tokens")
    .select("workspace_id, email, contact_id, unsubscribed_at")
    .eq("token", params.token)
    .maybeSingle();

  if (!tokenRow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-6 max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold">Unsubscribe link invalid</h1>
          <p className="text-xs text-muted-foreground">
            This unsubscribe link is not valid or has already been used.
          </p>
        </Card>
      </div>
    );
  }

  const workspaceId = (tokenRow as any).workspace_id as string;
  const email = String((tokenRow as any).email || "").toLowerCase().trim();

  // Mark token as unsubscribed (idempotent)
  if (!(tokenRow as any).unsubscribed_at) {
    await supabase
      .from("unsubscribe_tokens")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("token", params.token)
      .eq("workspace_id", workspaceId);
  }

  // Add to suppression list (compliance)
  if (workspaceId && email) {
    await supabase.rpc("suppress_contact", {
      p_workspace_id: workspaceId,
      p_email: email,
      p_reason: "unsubscribed",
      p_created_by: "system",
      p_created_by_user_id: null,
      p_notes: "One-click opt-out (/u/{token})",
    });

    // Cancel any queued/future outbound for this recipient (instant DNC)
    await supabase.rpc("ss_cancel_outbound_for_email", {
      p_workspace_id: workspaceId,
      p_email: email,
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="p-6 max-w-md text-center space-y-3">
        <h1 className="text-lg font-semibold">You&apos;re unsubscribed</h1>
        <p className="text-xs text-muted-foreground">
          You won&apos;t receive further emails to{" "}
          <span className="font-medium">{email}</span>.
        </p>
        <a href="/" rel="noreferrer">
          <Button size="sm" className="mt-2">
            Close
          </Button>
        </a>
      </Card>
    </div>
  );
}
