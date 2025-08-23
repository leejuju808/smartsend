"use client";
import { useEffect, useMemo, useState } from "react";

type Suggestion = { type: string; tone: string; text: string };

export default function ObjectionAssistant({
  lastMessage,
  vars,
  onInsert,
}: {
  lastMessage: string;
  vars: { first_name?: string; company?: string; my_name?: string; calendly?: string };
  onInsert: (text: string) => void;
}) {
  const [tone, setTone] = useState<"direct"|"friendly"|"consultative">("consultative");
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lastMessage) return;
    
    setLoading(true);
    fetch("/api/replies/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastMessage, tone, vars }),
    })
      .then(r => r.json())
      .then(j => setSugs(j.suggestions || []))
      .catch(() => setSugs([]))
      .finally(() => setLoading(false));
  }, [lastMessage, tone, JSON.stringify(vars)]); // keep simple

  const visible = useMemo(() => (sugs || []).slice(0, 3), [sugs]);

  if (!visible.length && !loading) return null;

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Objection Assistant</span>
        <select
          value={tone}
          onChange={e => setTone(e.target.value as any)}
          className="text-xs border rounded px-2 py-1 bg-white"
        >
          <option value="direct">Direct</option>
          <option value="friendly">Friendly</option>
          <option value="consultative">Consultative</option>
        </select>
      </div>

      {loading && (
        <div className="text-sm text-gray-500 text-center py-2">
          Analyzing message...
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((s, i) => (
          <button
            key={i}
            onClick={() => onInsert(s.text)}
            className="text-left border rounded p-2 hover:bg-white hover:shadow-sm transition-all bg-white"
            title={s.type}
          >
            <div className="text-xs uppercase text-gray-500 mb-1 font-medium">
              {s.type.replace(/_/g," ")}
            </div>
            <div className="text-sm whitespace-pre-line text-gray-700">{s.text}</div>
          </button>
        ))}
      </div>
    </div>
  );
} 