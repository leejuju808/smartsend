"use client";
import { useState } from "react";
import UpgradeModal from "@/components/UpgradeModal";

export default function NewSequenceButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [showModal, setShowModal] = useState(false);

  async function createSeq() {
    setBusy(true);
    try {
      const name = prompt("Sequence name?") || "New Sequence";
      const r = await fetch(`/api/sequences/create?userId=${userId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      const j = await r.json();
      if (r.status === 402) { setShowModal(true); return; }
      if (!r.ok) throw new Error(j?.error || "Create failed");
      window.location.href = `/sequences/${j.sequence.id}`;
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally { setBusy(false); }
  }

  return (
    <>
      <button onClick={createSeq} disabled={busy} className="rounded-xl bg-black text-white px-4 py-2">
        {busy ? "Creating…" : "New Sequence"}
      </button>
      <UpgradeModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}

