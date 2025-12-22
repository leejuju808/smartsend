"use client";

import Link from "next/link";

export default function Pagination({
  page,
  pageSize,
  total,
  buildHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (p: number) => string; // returns href with all current filters
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const prev = Math.max(1, page - 1);
  const next = Math.min(lastPage, page + 1);

  return (
    <div className="flex items-center justify-between py-3">
      <div className="text-xs opacity-70">
        Page <b>{page}</b> of <b>{lastPage}</b> • {total} rows
      </div>
      <div className="flex gap-2">
        <Link
          className={`px-3 py-1 rounded-xl border ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
          href={buildHref(prev)}
        >
          Prev
        </Link>
        <Link
          className={`px-3 py-1 rounded-xl border ${page >= lastPage ? "pointer-events-none opacity-50" : ""}`}
          href={buildHref(next)}
        >
          Next
        </Link>
      </div>
    </div>
  );
}


