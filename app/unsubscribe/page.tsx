// app/unsubscribe/page.tsx
"use client";

import { useEffect, useState } from "react";

export default function UnsubscribePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");

    if (e) setEmail(e);
  }, []);

  async function handleUnsubscribe(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage(null);

    const cleaned = email.trim().toLowerCase();

    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleaned }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to unsubscribe");
      }

      setStatus("success");
      setMessage(
        "You have been unsubscribed. You will not receive further emails."
      );
    } catch (err: any) {
      console.error("Unsubscribe error:", err);
      setStatus("error");
      setMessage(err.message ?? "Failed to unsubscribe. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
        <h1 className="text-lg font-semibold text-neutral-50">
          Unsubscribe
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Enter your email to stop receiving messages sent via SmartSend.
        </p>
        <form onSubmit={handleUnsubscribe} className="mt-4 space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100"
            />
          </div>
          {message && (
            <div
              className={`text-xs ${
                status === "success" ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {message}
            </div>
          )}
          <button
            type="submit"
            disabled={status === "submitting"}
            className="mt-1 w-full rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-60"
          >
            {status === "submitting" ? "Processing..." : "Confirm Unsubscribe"}
          </button>
        </form>
        <p className="mt-4 text-[0.7rem] text-neutral-500">
          Powered by SmartSend. This form only manages email delivery preferences.
        </p>
      </div>
    </div>
  );
}
