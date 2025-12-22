"use client";

import React from "react";

export default function EmailPreviewButton({ logId, providerUrl }: { logId: string; providerUrl?: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<{subject: string; html: string} | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/email-log/${logId}`, { cache: "no-store" });
    const j = await r.json();
    setData(j?.log ? { subject: j.log.subject_rendered, html: j.log.html_rendered } : null);
    setLoading(false);
  }

  async function copyHtml() {
    if (!data?.html) return;
    await navigator.clipboard.writeText(data.html);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); if (!data) load(); }}
        className="rounded-lg border px-2 py-1 text-xs"
      >
        View email
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="w-[900px] max-h-[80vh] overflow-hidden rounded-2xl border bg-background">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="text-sm font-medium">{data?.subject ?? "Email"}</div>
              <div className="flex gap-2">
                <button onClick={copyHtml} className="rounded-lg border px-2 py-1 text-xs">Copy raw HTML</button>
                {providerUrl && <a href={providerUrl} target="_blank" rel="noreferrer" className="rounded-lg border px-2 py-1 text-xs">Open in provider</a>}
                <button onClick={()=>setOpen(false)} className="rounded-lg border px-2 py-1 text-xs">Close</button>
              </div>
            </div>
            <div className="p-0">
              {loading && <div className="p-6 text-sm opacity-60">Loading…</div>}
              {!loading && data?.html && (
                <iframe
                  title="email-preview"
                  className="w-full h-[70vh] bg-white"
                  sandbox=""
                  srcDoc={data.html}
                />
              )}
              {!loading && !data?.html && <div className="p-6 text-sm opacity-60">No snapshot available.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

