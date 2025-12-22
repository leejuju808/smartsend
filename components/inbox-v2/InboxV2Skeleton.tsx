// Block 19680 — Inbox Performance Optimizer v1
// Skeleton loading states for inbox

export function ThreadListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-3 border rounded-lg animate-pulse"
        >
          <div className="flex items-start gap-2">
            <div className="w-4 h-4 bg-gray-200 rounded mt-1" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <div className="h-4 bg-gray-200 rounded w-32" />
                <div className="h-3 bg-gray-200 rounded w-16" />
              </div>
              <div className="h-3 bg-gray-200 rounded w-24" />
              <div className="space-y-1">
                <div className="h-2 bg-gray-200 rounded w-full" />
                <div className="h-2 bg-gray-200 rounded w-3/4" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 bg-gray-200 rounded w-24" />
                <div className="h-3 bg-gray-200 rounded w-20" />
              </div>
              <div className="space-y-1">
                <div className="h-3 bg-gray-200 rounded w-full" />
                <div className="h-3 bg-gray-200 rounded w-5/6" />
                <div className="h-3 bg-gray-200 rounded w-4/6" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MetricsBarSkeleton() {
  return (
    <div className="p-4 border-b animate-pulse">
      <div className="flex items-center gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 bg-gray-200 rounded w-16" />
            <div className="h-6 bg-gray-200 rounded w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}



















































