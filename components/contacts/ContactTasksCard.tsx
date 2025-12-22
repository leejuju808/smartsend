// components/contacts/ContactTasksCard.tsx
"use client";

import useSWR from "swr";

export function ContactTasksCard({ contactId }: { contactId: string }) {
  const { data, error } = useSWR(
    `/api/contacts/${contactId}/tasks`,
    (url) => fetch(url).then((r) => r.json())
  );

  if (error) return null;
  const tasks = data || [];

  return (
    <div className="border rounded-2xl p-3 bg-white space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Tasks for this contact</div>
        <div className="text-[11px] text-gray-500">{tasks.length} total</div>
      </div>
      {tasks.length === 0 && (
        <div className="text-[11px] text-gray-500">
          No tasks yet. When this lead replies, SmartSend can create a call task here.
        </div>
      )}
      <div className="space-y-1.5">
        {tasks.map((t: any) => (
          <div
            key={t.id}
            className="text-[11px] flex justify-between border rounded-xl px-2 py-1"
          >
            <span>{t.title}</span>
            {t.due_at && (
              <span className="text-gray-500">
                {new Date(t.due_at).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}



























































