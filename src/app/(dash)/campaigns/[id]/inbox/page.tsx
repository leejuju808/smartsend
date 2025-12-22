import InboxPageClient from "./InboxPageClient";
import { getInboxThreads } from "@/lib/db/inbox";

export const revalidate = 0;

export default async function CampaignInboxPage({ params }: { params: { id: string } }) {
  const initial = await getInboxThreads(params.id);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">Latest replies and automations for this campaign.</p>
      </div>
      <InboxPageClient initial={initial} />
    </div>
  );
}













