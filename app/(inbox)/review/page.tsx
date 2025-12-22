import { use } from "react";
import Link from "next/link";

async function loadOpen() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reply_review_items?status=eq.open&select=id,created_at,campaign_id,lead_id,proposed_label,score`;
  const r = await fetch(url, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error("Failed to load review queue");
  }
  return r.json();
}

export default function ReviewPage() {
  const items = use(loadOpen());
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Review Queue</h1>
      <div className="grid gap-3">
        {items.map((it: any) => (
          <Link
            key={it.id}
            href={`/inbox/review/${it.id}`}
            className="border rounded-xl p-4 hover:bg-muted"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {new Date(it.created_at).toLocaleString()}
              </div>
              <div className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-900">
                proposed: {it.proposed_label} · score {it.score ?? "—"}
              </div>
            </div>
            <div className="mt-2 text-sm">
              Campaign: {it.campaign_id} · Lead: {it.lead_id}
            </div>
          </Link>
        ))}
      </div>
      {items.length === 0 && (
        <div className="text-sm text-muted-foreground">No items awaiting review.</div>
      )}
    </div>
  );
}

