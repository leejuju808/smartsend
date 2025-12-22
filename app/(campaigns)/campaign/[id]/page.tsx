import AuditPanel from "@/app/(campaign)/[id]/AuditPanel";
import { ShareDialog } from "./components/ShareDialog";

export default function CampaignPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Campaign</h1>
        <ShareDialog campaignId={params.id} />
      </div>

      <AuditPanel campaignId={params.id} />
    </div>
  );
}


