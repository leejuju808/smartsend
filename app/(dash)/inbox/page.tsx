import InboxHeader from "@/components/inbox/InboxHeader";
import InboxList from "@/components/inbox/InboxList";

export default function InboxPage({ searchParams }: { searchParams?: { campaignId?: string } }) {
  const campaignId = searchParams?.campaignId;

  return (
    <div className="rounded-md border">
      <InboxHeader campaignId={campaignId} />
      <InboxList campaignId={campaignId} />
    </div>
  );
}