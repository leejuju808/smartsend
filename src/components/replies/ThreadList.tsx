'use client';

import { useEffect, useRef } from 'react';
import { InboxRow } from '@/lib/replies/types';
import ThreadRow from './ThreadRow';

export default function ThreadList({ 
  rows, 
  selectedId, 
  onSelect, 
  loadMore,
  taskThreadIds
}: {
  rows: InboxRow[]; 
  selectedId?: string | null; 
  onSelect: (id: string) => void; 
  loadMore: () => void;
  taskThreadIds?: Set<string>;
}) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (sentinel.current) {
      io.observe(sentinel.current);
    }

    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div className="divide-y">
      {rows.map((r) => (
        <ThreadRow
          key={r.thread_id}
          row={r}
          selected={selectedId === r.thread_id}
          onClick={() => onSelect(r.thread_id)}
          hasTask={taskThreadIds?.has(r.thread_id)}
        />
      ))}
      <div ref={sentinel} className="h-8" />
    </div>
  );
}
