"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryToken = useMemo(() => searchParams.get("token"), [searchParams]);

  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const accept = async (value: string) => {
    if (!value) return;
    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to accept invite");
      }

      setStatus("success");
      setTimeout(() => {
        router.replace("/dashboard");
      }, 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to accept invite";
      setError(message);
      setStatus("error");
    }
  };

  useEffect(() => {
    if (queryToken && !autoSubmitted) {
      setToken(queryToken);
      setAutoSubmitted(true);
      void accept(queryToken);
    }
  }, [queryToken, autoSubmitted]);

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <header>
        <h1 className="text-xl font-semibold">Accept Invite</h1>
        <p className="text-sm text-muted-foreground">
          Paste your invite token or follow the link from your email.
        </p>
      </header>

      <input
        className="h-10 rounded border px-3 text-sm"
        placeholder="Invite token"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        disabled={status === "submitting"}
      />

      <button
        className="h-10 rounded bg-zinc-900 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => accept(token)}
        disabled={!token || status === "submitting"}
      >
        {status === "submitting" ? "Accepting…" : "Accept invite"}
      </button>

      {status === "success" && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Invite accepted! Redirecting…
        </div>
      )}

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
}
