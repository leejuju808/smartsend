"use client";
import { useRouter, useSearchParams } from "next/navigation";

export default function PaginationBar(props: {
  total: number; page: number; pageSize: number; totalPages: number;
  onPrev(): void; onNext(): void; onFirst(): void; onLast(): void;
  onPageSize(ps: number): void;
}) {
  const { total, page, pageSize, totalPages, onPrev, onNext, onFirst, onLast, onPageSize } = props;
  const sp = useSearchParams();
  const router = useRouter();

  const apply = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (!v) next.delete(k); else next.set(k, v);
    router.replace(`?${next.toString()}`);
  };

  const updatePageInUrl = (p: number) => apply("page", String(p));
  const updatePageSizeInUrl = (ps: number) => apply("pageSize", String(ps));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-t bg-background/60 sticky bottom-0">
      <div className="text-sm text-muted-foreground">
        {total.toLocaleString()} total • Page {page} / {totalPages} • {pageSize} per page
      </div>
      <div className="flex items-center gap-2">
        <button className="px-2 py-1 border rounded disabled:opacity-50" onClick={() => { onFirst(); updatePageInUrl(1); }} disabled={page <= 1}>« First</button>
        <button className="px-2 py-1 border rounded disabled:opacity-50" onClick={() => { onPrev(); updatePageInUrl(Math.max(1, page - 1)); }} disabled={page <= 1}>‹ Prev</button>
        <button className="px-2 py-1 border rounded disabled:opacity-50" onClick={() => { onNext(); updatePageInUrl(Math.min(totalPages, page + 1)); }} disabled={page >= totalPages}>Next ›</button>
        <button className="px-2 py-1 border rounded disabled:opacity-50" onClick={() => { onLast(); updatePageInUrl(totalPages); }} disabled={page >= totalPages}>Last »</button>

        <select
          className="ml-3 border rounded px-2 py-1"
          value={pageSize}
          onChange={(e) => { const ps = parseInt(e.target.value, 10); onPageSize(ps); updatePageSizeInUrl(ps); }}
        >
          {[25, 50, 100].map((n) => <option key={n} value={n}>{n}/page</option>)}
        </select>
      </div>
    </div>
  );
}


