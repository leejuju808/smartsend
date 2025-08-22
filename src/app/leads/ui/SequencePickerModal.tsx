"use client";
import { useEffect, useState } from "react";

type Seq = { id:string; name:string; status:string };

export default function SequencePickerModal({
  open, onClose, userId, selectedLeadIds, onEnrolled
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  selectedLeadIds: string[];
  onEnrolled?: () => void;
}) {
  const [items, setItems] = useState<Seq[]>([]);
  const [seqId, setSeqId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const canEnroll = open && selectedLeadIds.length > 0 && seqId;

  useEffect(() => {
    if (!open) return;
    (async () => {
      const r = await fetch(`/api/sequences/list?userId=${userId}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setItems((j.items || []).filter((s: Seq) => s.status !== "completed"));
    })();
  }, [open, userId]);

  async function enroll() {
    if (!canEnroll) return;
    setBusy(true);
    try {
      // policy check (avoid confusion at cap)
      const pol = await fetch(`/api/sending/policy?userId=${userId}`, { cache: "no-store" }).then(r=>r.json());
      if (pol?.atCap) {
        alert("You’re at today’s send cap. Upgrade or try again tomorrow.");
        return;
      }
      const r = await fetch(`/api/sequences/${seqId}/enroll?userId=${userId}`, {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds, startNow: true })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Enroll failed");
      onEnrolled?.();
      alert(`Enrolled ${selectedLeadIds.length} lead(s). First sends start around ${new Date(j.scheduled_for).toLocaleString()}.`);
    } catch (e:any) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-[520px] grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Enroll to Sequence</h3>
          <button onClick={onClose} className="text-gray-500">✕</button>
        </div>
        <div className="text-sm text-gray-600">Selected leads: <b>{selectedLeadIds.length}</b></div>
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Choose a sequence</div>
          <select className="border rounded-xl px-3 py-2 w-full" value={seqId} onChange={e=>setSeqId(e.target.value)}>
            <option value="">Select…</option>
            {items.map((s: Seq) => (
              <option key={s.id} value={s.id}>{s.name} — {s.status}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-xl bg-gray-100">Cancel</button>
          <button onClick={enroll} disabled={!canEnroll || busy} className="px-3 py-1.5 rounded-xl bg-black text-white">
            {busy ? "Enrolling…" : "Enroll & Start"}
          </button>
        </div>
        <div className="text-xs text-gray-500">
          Sends go out ~10:05am in each lead’s timezone (or auto-guessed), respecting your quiet hours.
        </div>
      </div>
    </div>
  );
}
