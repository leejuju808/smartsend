export function LoadingState() {
  return (
    <div className="rounded-2xl border p-4">
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-3 space-y-2">
        <div className="h-9 w-full animate-pulse rounded bg-muted" />
        <div className="h-9 w-full animate-pulse rounded bg-muted" />
        <div className="h-9 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}


