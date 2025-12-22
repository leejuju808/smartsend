"use client";

import { useSearchParams } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { InboxFilterBar } from "@/components/replies/inbox-filter-bar";
import { ThreadRow } from "@/components/replies/thread-row";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function RepliesPageClient({ accountId }: { accountId: string }) {
  const searchParams = useSearchParams();
  
  // Build base query string from search params (excluding page)
  const baseParams = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key !== "page") {
      baseParams.append(key, value);
    }
  });
  const baseQueryString = baseParams.toString();

  const getKey = (pageIndex: number, previousPageData: any) => {
    // Stop fetching if previous page had no threads
    if (previousPageData && !previousPageData.threads?.length) return null;

    const page = pageIndex + 1;
    const queryString = baseQueryString 
      ? `${baseQueryString}&page=${page}` 
      : `page=${page}`;
    
    return `/api/replies?${queryString}`;
  };

  const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false,
    }
  );

  const threads = data?.flatMap((d) => d.threads || []) || [];
  const isLoadingMore = isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const isEmpty = data?.[0]?.threads?.length === 0;
  const isReachingEnd = isEmpty || (data && data[data.length - 1]?.threads?.length < 30);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 p-4">
        <InboxFilterBar accountId={accountId} />
        <div className="text-sm text-destructive">
          Error loading replies: {error.message || "Unknown error"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-4">
      <InboxFilterBar accountId={accountId} />
      
      {isLoading && threads.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isEmpty ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No threads found. Try adjusting your filters.
        </div>
      ) : (
        <>
          <div className="space-y-0">
            {threads.map((thread: any) => (
              <ThreadRow key={thread.id} thread={thread} />
            ))}
          </div>
          
          <div className="text-center pt-4">
            <Button
              onClick={() => setSize(size + 1)}
              disabled={isLoadingMore || isReachingEnd}
              variant="outline"
              className="px-4 py-2"
            >
              {isLoadingMore
                ? "Loading…"
                : isReachingEnd
                ? "No more threads"
                : "Load More"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

