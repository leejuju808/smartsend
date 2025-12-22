"use client";

import * as React from "react";

type NudgeState =
  | null
  | {
      needs?: boolean;
      queued_at?: string | null;
      run_at?: string | null;
      nudge_no?: number | null;
      in_hours?: number | null;
    };

export function NudgeBanner({ threadId }: { threadId: string }) {
  const [state, setState] = React.useState<NudgeState>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/thread/${threadId}/nudge-state`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (alive) setState(json);
      } catch {
        if (alive) setState(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [threadId]);

  if (!state?.needs) return null;

  const queued = Boolean(state.queued_at);
  const runAt = state?.run_at ? new Date(state.run_at) : null;

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-sm">
      {queued ? (
        <>
          Follow-up scheduled for <b>{runAt?.toLocaleString()}</b> (nudge #{state.nudge_no}).
        </>
      ) : (
        <>
          Eligible for follow-up in <b>{state.in_hours}h</b>.
        </>
      )}
    </div>
  );
}


