"use client";
type ThreadSummary = {
  gmail_thread_id: string;
  from_email: string;
  subject: string;
  last_snippet?: string;
  last_ts?: string;
  unread?: boolean;
  lead_replied?: boolean;
};

export default function ThreadListSimple({
  threads, selected, onSelect
}: {
  threads: ThreadSummary[];
  selected?: string | null;
  onSelect: (threadId: string) => void;
}) {
  return (
    <div className="w-80 border-r border-neutral-800 overflow-auto">
      {threads.map(t => (
        <button
          key={t.gmail_thread_id}
          onClick={() => onSelect(t.gmail_thread_id)}
          className={`w-full text-left p-3 border-b border-neutral-800 hover:bg-white/5 ${selected===t.gmail_thread_id ? "bg-white/5" : ""}`}
        >
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate">{t.from_email}</p>
            {t.lead_replied && (
              <span className="ml-2 rounded-full bg-green-500/10 text-green-400 text-xs px-2 py-0.5">
                Replied
              </span>
            )}
          </div>
          <p className="text-sm opacity-80 truncate">{t.subject}</p>
          {t.last_snippet && <p className="text-xs opacity-60 truncate mt-0.5">{t.last_snippet}</p>}
          {t.last_ts && <p className="text-[10px] opacity-50 mt-0.5">{new Date(t.last_ts).toLocaleString()}</p>}
        </button>
      ))}
    </div>
  );
}

