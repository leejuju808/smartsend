// components/dashboard/Pagination.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();
  const sp = useSearchParams();

  const go = (p: number) => {
    const params = new URLSearchParams(sp.toString());
    params.set("page", String(p));
    router.push(`/dashboard/leads?${params.toString()}`);
  };

  return (
    <div className="flex items-center justify-between mt-4">
      <button
        onClick={() => go(Math.max(1, page - 1))}
        disabled={page <= 1}
        className={`px-4 py-2 rounded-xl ${page <= 1 ? "bg-gray-800 text-gray-500" : "bg-gray-200 text-black hover:bg-gray-300"}`}
      >
        Prev
      </button>
      <div className="text-sm text-gray-300">
        Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{totalPages}</span>
      </div>
      <button
        onClick={() => go(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className={`px-4 py-2 rounded-xl ${page >= totalPages ? "bg-gray-800 text-gray-500" : "bg-gray-200 text-black hover:bg-gray-300"}`}
      >
        Next
      </button>
    </div>
  );
}