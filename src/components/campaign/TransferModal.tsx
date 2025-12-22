"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function TransferModal({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/campaigns/${campaignId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Failed");
    } else {
      setOk(true);
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1500);
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div
        className="bg-background rounded-2xl shadow-xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Transfer ownership</h3>
          <p className="text-sm text-muted-foreground">
            New owner's email (must have a SmartSend account):
          </p>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new.owner@example.com"
            disabled={busy || ok}
          />
          {err && <p className="text-sm text-red-500">{err}</p>}
          {ok && (
            <p className="text-sm text-green-600">Ownership transferred.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Close
            </Button>
            <Button
              onClick={submit}
              disabled={busy || !email || ok}
            >
              Transfer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

