"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const supabase = createClientComponentClient();

const API = {
  regen: "/api/drafts/regenerate",
  approveAndQueue: "/api/drafts/approve-and-queue",
};

export default function DraftReviewDrawer({ campaignId }: { campaignId: string }) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  // add state for selection
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from("email_drafts")
      .select("id, lead_id, subject, body_markdown, status, leads(first_name,last_name,company,email)")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setDrafts(data);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const toggle = (id: string) =>
    setSelected(s => ({ ...s, [id]: !s[id] }));

  const allSelectedIds = Object.entries(selected).filter(([,v])=>v).map(([k])=>k);

  const selectAll = () =>
    setSelected(Object.fromEntries(drafts.map(d => [d.id, true])));
  const clearAll = () => setSelected({});

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("email_drafts").update({ status }).eq("id", id);
    if (!error) setDrafts((d) => d.map(x => x.id === id ? { ...x, status } : x));
  };

  const regenerate = async (leadId: string) => {
    if (!confirm("Regenerate a fresh draft for this lead?")) return;
    const res = await fetch(API.regen, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, leadId }),
    });
    const j = await res.json();
    if (!res.ok) return alert(j.error || "Failed");
    await load();
  };

  const approveAndQueue = async (draftId: string) => {
    const res = await fetch(API.approveAndQueue, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId }),
    });
    const j = await res.json();
    if (!res.ok) return alert(j.error || "Failed");
    // reflect approved status instantly
    setDrafts(d => d.map(x => x.id === draftId ? { ...x, status: "approved" } : x));
    alert("Approved and queued ✅");
  };

  const batchApproveQueue = async () => {
    if (allSelectedIds.length === 0) return alert("Select drafts first");
    const res = await fetch("/api/drafts/batch-approve-queue", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ draftIds: allSelectedIds })
    });
    const j = await res.json();
    if (!res.ok) return alert(j.error || "Failed");
    // reflect approved status
    setDrafts(d => d.map(x => selected[x.id] ? { ...x, status: "approved" } : x));
    clearAll();
    alert(`Approved & queued: ${j.ok}, failed: ${j.failed}`);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-2xl bg-neutral-800 text-white border border-neutral-700"
      >
        Review Drafts
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50">
          <div className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-neutral-950 border-l border-neutral-800 p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">AI Drafts</h2>
              <button onClick={() => setOpen(false)} className="text-neutral-300">Close</button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={selectAll} className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700">Select all</button>
              <button onClick={clearAll} className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700">Clear</button>
              <button onClick={batchApproveQueue} className="px-3 py-2 rounded-xl bg-yellow-400 text-black font-semibold">Approve → Queue Selected</button>
            </div>
            <div className="space-y-4">
              {drafts.map((d) => (
                <div key={d.id} className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/50">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected[d.id]}
                      onChange={() => toggle(d.id)}
                      className="mt-1 accent-yellow-400"
                    />
                    <div className="flex-1">
                      <div className="text-sm text-neutral-400">
                        {d.leads?.first_name} {d.leads?.last_name} · {d.leads?.company} · {d.leads?.email}
                      </div>
                      <div className="mt-2 font-semibold">{d.subject}</div>
                      <pre className="mt-2 whitespace-pre-wrap text-neutral-200 text-sm">{d.body_markdown}</pre>
                      <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => updateStatus(d.id, "approved")}
                      className="px-3 py-2 rounded-xl bg-green-500 text-black font-semibold"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updateStatus(d.id, "rejected")}
                      className="px-3 py-2 rounded-xl bg-rose-500 text-black font-semibold"
                    >
                      Reject
                    </button>
                    <button 
                      onClick={() => approveAndQueue(d.id)} 
                      className="px-3 py-2 rounded-xl bg-yellow-400 text-black font-semibold"
                    >
                      Approve → Queue Now
                    </button>
                    <button 
                      onClick={() => regenerate(d.lead_id)} 
                      className="px-3 py-2 rounded-xl bg-neutral-700 text-white"
                    >
                      Regenerate
                    </button>
                        <span className="ml-auto text-xs uppercase tracking-wide text-neutral-400">
                          {d.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {drafts.length === 0 && <div className="text-neutral-400">No drafts yet. Generate some.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}