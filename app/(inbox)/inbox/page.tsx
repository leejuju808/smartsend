import { listThreadsWithStatus, InboxFilter } from "@/lib/inbox";

import { BulkBar } from "./partials/BulkBar";
import { FilterBar } from "./partials/FilterBar";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { filter?: InboxFilter };
}) {
  const filter = (searchParams.filter as InboxFilter) ?? "all";
  const threads = await listThreadsWithStatus({ filter, limit: 100 });

  return (
    <div className="space-y-3">
      <FilterBar active={filter} />
      <BulkBar />
      <div className="divide-y rounded-lg border">
        {threads.map((t: any) => (
          <ThreadRow key={t.id} thread={t} />
        ))}
      </div>
    </div>
  );
}

function ThreadRow({ thread }: { thread: any }) {
  return (
    <label className="grid grid-cols-[24px,1fr,auto] items-center gap-3 px-3 py-2 hover:bg-muted/50">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border"
        data-thread-select
        value={thread.id}
      />
      <div className="truncate">
        <div className="font-medium truncate">
          {thread.subject ?? "(no subject)"}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {thread.preview ?? ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] rounded-2xl px-2 py-0.5 border">
          {thread.latest_intent ?? "Unclassified"}
        </span>
        {thread.auto_paused && (
          <span className="text-[10px] rounded-2xl px-2 py-0.5 border">
            Auto-Paused
          </span>
        )}
      </div>
    </label>
  );
}





