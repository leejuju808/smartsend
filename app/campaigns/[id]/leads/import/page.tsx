import { createClient } from "@/lib/supabase/server";
import { ImportLeadsClient } from "./ImportLeadsClient";

export default async function ImportLeadsPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return <div className="p-6 text-sm">Campaign not found.</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-2">
        Import Leads into: {campaign.name || "Untitled campaign"}
      </h1>
      <p className="text-xs text-muted-foreground mb-4">
        Upload a CSV, map your columns, and SmartSend will clean + import your leads.
      </p>
      <ImportLeadsClient campaignId={campaign.id} />
    </div>
  );
}


































































