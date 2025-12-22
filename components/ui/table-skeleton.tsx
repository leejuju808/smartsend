"use client";

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-3 py-2 text-left text-sm font-medium">
                <div className="h-4 w-24 animate-pulse bg-muted rounded" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b">
              {Array.from({ length: cols }).map((__, c) => (
                <td key={c} className="px-3 py-2">
                  <div className="h-4 w-[70%] animate-pulse bg-muted rounded" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

