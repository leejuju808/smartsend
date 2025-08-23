"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Status = {
  has_token: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  revoked: boolean | null;
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleString();
}

export default function ExtensionHealthCard() {
  const [s, setS] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"revoke" | "regen" | null>(null);

  async function refresh() {
    setLoading(true);
    const r = await fetch("/api/extension/status");
    const j = await r.json();
    setS(r.ok ? j : null);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function revoke() {
    setBusy("revoke");
    await fetch("/api/extension/revoke", { method: "POST" });
    setBusy(null);
    refresh();
  }

  async function regenerate() {
    setBusy("regen");
    const r = await fetch("/api/extension/regenerate", { method: "POST" });
    const j = await r.json();
    setBusy(null);
    if (j?.link) window.open(j.link, "_blank");
    refresh();
  }

  const healthy = !!s?.has_token && !s?.revoked;

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Chrome Extension</h3>
        <span className={`text-xs px-2 py-1 rounded ${healthy ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
          {loading ? "Checking…" : healthy ? "Connected" : "Not connected"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="text-gray-500">Last used</div>
        <div>{fmt(s?.last_used_at || null)}</div>
        <div className="text-gray-500">Expires</div>
        <div>{fmt(s?.expires_at || null)}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!healthy && (
          <Link href="/extension/link" className="px-3 py-2 rounded bg-black text-white text-sm">
            Connect Extension
          </Link>
        )}
        {healthy && (
          <>
            <button
              onClick={regenerate}
              disabled={busy !== null}
              className="px-3 py-2 rounded border text-sm"
            >
              {busy === "regen" ? "Re-linking…" : "Re-link"}
            </button>
            <button
              onClick={revoke}
              disabled={busy !== null}
              className="px-3 py-2 rounded border text-sm"
            >
              {busy === "revoke" ? "Revoking…" : "Disconnect"}
            </button>
          </>
        )}
        <a
          href="https://chrome.google.com/webstore" target="_blank" rel="noreferrer"
          className="px-3 py-2 rounded border text-sm"
        >
          Get Chrome Extension
        </a>
      </div>

      <p className="text-xs text-gray-500">
        Tip: After connecting, open Gmail and look for the "✨ Smart Reply" button in the compose box.
      </p>
    </div>
  );
} 