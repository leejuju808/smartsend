import { createServerClient } from "@/lib/supabase/server";
import { SuppressionClient } from "./SuppressionClient";

export default async function SuppressionPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-sm">You must be logged in.</div>;
  }

  const { data: rows } = await supabase
    .from("smartsend_suppressions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-1">Suppression &amp; Unsubscribe</h1>
      <p className="text-xs text-muted-foreground mb-4">
        Emails and domains here will never be emailed by your SmartSend campaigns.
      </p>
      <SuppressionClient initialRows={rows ?? []} />
    </div>
  );
}
