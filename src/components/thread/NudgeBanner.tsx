"use client";

import * as React from "react";

type NudgeState =
  | null
  | {
      needs: boolean;
      queued_at?: string | null;
      run_at?: string | null;
      nudge_no?: number | null;
      in_hours?: number | null;
    };

export function NudgeBanner({ threadId }: { threadId: string }) {
  const [state, setState] = React.useState<NudgeState>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/thread/${threadId}/nudge-state`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        if (mounted) setState(json);
      } catch (error) {
        console.debug("NudgeBanner fetch failed", error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [threadId]);

  if (!state?.needs) {
    return null;
  }

  if (state.queued_at) {
    const runAt = state.run_at ? new Date(state.run_at) : null;
    const formatted = runAt?.toLocaleString() ?? "soon";
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-sm">
        Follow-up scheduled for <b>{formatted}</b>
        {typeof state.nudge_no === "number"
          ? ` (nudge #${state.nudge_no})`
          : "."}
      </div>
    );
  }

  const hours = typeof state.in_hours === "number" ? state.in_hours : null;
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-sm">
      Eligible for follow-up in{" "}
      <b>{hours !== null ? `${hours}h` : "a bit"}</b>.
    </div>
  );
}


