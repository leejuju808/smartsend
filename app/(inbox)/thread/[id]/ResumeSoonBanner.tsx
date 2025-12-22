"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

type Props = {
  resumeAt?: string | null;
  threadId: string;
};

export function ResumeSoonBanner({ resumeAt, threadId }: Props) {
  if (!resumeAt) return null;
  const resumeTime = new Date(resumeAt);
  const soon = resumeTime.getTime() - Date.now();
  if (Number.isNaN(resumeTime.getTime()) || soon <= 0 || soon > 24 * 60 * 60 * 1000) return null;

  const [pending, setPending] = React.useState(false);
  const router = useRouter();

  const human = resumeTime.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  async function onDelay() {
    setPending(true);
    try {
      const res = await fetch(`/api/thread/${threadId}/resume/delay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 7 })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to delay thread resume");
      }
      router.refresh();
    } catch (error) {
      console.error(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
      <div className="flex items-center gap-3">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">Resuming soon</div>
          <div className="text-sm opacity-85">
            This thread will auto-resume around <span className="font-semibold">{human}</span>.
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onDelay}
        disabled={pending}
        className="rounded-xl border border-amber-400/60 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Delaying..." : "Delay 7d"}
      </button>
    </div>
  );
}

