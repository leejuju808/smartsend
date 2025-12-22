"use client";

import * as React from "react";
import { toast } from "sonner";

type Slot = {
  id: string;
  start_utc: string;
  end_utc: string;
  score: number;
  held?: boolean;
  rep_busy?: boolean;
};

type AlternativeSlot = {
  id: string;
  start_utc: string;
  end_utc: string;
  score: number;
  provisional?: boolean;
  url?: string | null;
};

type ThreadCtx = {
  ok: boolean;
  thread: {
    id: string;
    subject: string | null;
    has_meeting_intent: boolean;
    proposed_meeting: string | null;
    booked_meeting_at: string | null;
  };
  lead: {
    name: string | null;
    email: string | null;
    sto_best_hour: number | null;
  };
  scheduling: {
    lead_tz: string;
    campaign_tz: string;
    duration_min: number;
    workdays: number[];
    start_hour: number;
    end_hour: number;
    buffer_min: number;
    location: string;
    booking_link: string | null;
    auto_book_links: boolean;
    confirmation_template: string | null;
    window_start: string | null;
    window_end: string | null;
    note: string | null;
  };
};

function ConflictHelp({
  threadId,
  slotId,
  leadTz,
  canInsert,
  fetchAlternativesCount = 3,
  confirmSlot,
  insertAlternatives,
  onAfterConfirm,
}: {
  threadId: string;
  slotId: string;
  leadTz: string;
  canInsert: boolean;
  fetchAlternativesCount?: number;
  confirmSlot: (slotId: string) => Promise<boolean>;
  insertAlternatives: (alternatives: AlternativeSlot[]) => Promise<boolean>;
  onAfterConfirm?: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [alts, setAlts] = React.useState<AlternativeSlot[]>([]);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [inserting, setInserting] = React.useState(false);

  const formatRange = React.useCallback(
    (iso: string) =>
      new Date(iso).toLocaleString(undefined, {
        timeZone: leadTz,
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [leadTz],
  );

  async function loadAlternatives() {
    setLoading(true);
    setFetchError(null);
    setAlts([]);
    try {
      const res = await fetch(`/api/thread/${threadId}/meeting/alternatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_id: slotId, n: fetchAlternativesCount }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const message = json?.error ?? "Unable to find alternatives";
        setFetchError(typeof message === "string" ? message : "Unable to find alternatives");
        toast.error(`Alternative search failed: ${message}`);
        return;
      }
      let items: AlternativeSlot[] = Array.isArray(json.items) ? json.items : [];

      const realIds = items.filter((item) => !item.provisional && typeof item.id === "string").map((item) => item.id);
      if (realIds.length) {
        try {
          const linkRes = await fetch(`/api/thread/${threadId}/meeting/booking-links`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slot_ids: realIds }),
          });
          const linkJson = await linkRes.json().catch(() => ({}));
          if (linkRes.ok && Array.isArray(linkJson?.items)) {
            const linkMap = new Map<string, string>(
              linkJson.items.map((item: any) => [item.slot_id, item.url] as [string, string]),
            );
            items = items.map((item) => ({
              ...item,
              url: linkMap.get(item.id) ?? item.url ?? null,
            }));
          }
        } catch (err) {
          console.error("booking links fetch failed", err);
        }
      }

      setAlts(items);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(slot: AlternativeSlot) {
    if (!slot || slot.provisional) return;
    setConfirmingId(slot.id);
    try {
      const ok = await confirmSlot(slot.id);
      if (ok) {
        setAlts([]);
        onAfterConfirm?.();
      }
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleInsert() {
    if (!alts.length || !canInsert) return;
    setInserting(true);
    try {
      await insertAlternatives(alts);
    } finally {
      setInserting(false);
    }
  }

  const hasProvisional = React.useMemo(
    () => alts.some((alt) => alt.provisional),
    [alts],
  );

  return (
    <div className="rounded-md border p-2 space-y-2 bg-muted/20">
      <div className="text-sm">
        This time isn’t available.&nbsp;
        {loading ? (
          <span>Searching…</span>
        ) : (
          <button className="underline" onClick={loadAlternatives}>
            Find {fetchAlternativesCount} alternatives
          </button>
        )}
      </div>
      {fetchError ? <div className="text-xs text-destructive">{fetchError}</div> : null}
      {!!alts.length && (
        <div className="grid gap-2 sm:grid-cols-2">
          {alts.map((alt) => (
            <button
              key={`${alt.start_utc}-${alt.end_utc}`}
              disabled={Boolean(alt.provisional) || confirmingId === alt.id}
              onClick={() => handleConfirm(alt)}
              className={`text-left rounded-md border p-2 hover:bg-muted transition ${
                alt.provisional ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <div className="font-medium">
                {formatRange(alt.start_utc)} → {formatRange(alt.end_utc)}
              </div>
              {alt.url ? (
                <div className="mt-1 text-xs text-muted-foreground truncate">{alt.url}</div>
              ) : null}
              {alt.provisional ? (
                <div className="mt-1 text-xs text-muted-foreground">Preview – insert into composer to use</div>
              ) : null}
              {confirmingId === alt.id ? (
                <div className="mt-1 text-xs text-muted-foreground">Confirming…</div>
              ) : null}
            </button>
          ))}
        </div>
      )}
      {canInsert && alts.length > 0 ? (
        <button
          className="text-sm underline"
          onClick={handleInsert}
          disabled={inserting || !alts.length}
        >
          {inserting ? "Adding to composer…" : "Insert these into composer"}
        </button>
      ) : null}
      {!alts.length && !loading && !fetchError ? (
        <div className="text-xs text-muted-foreground">No alternatives yet — try searching.</div>
      ) : null}
      {hasProvisional && !canInsert ? (
        <div className="text-xs text-muted-foreground">
          Alternatives without IDs can be inserted into the composer when available.
        </div>
      ) : null}
    </div>
  );
}

export function MeetingCard({
  threadId,
  onSuggest,
  onInviteAttached,
}: {
  threadId: string;
  onSuggest?: (text: string) => void;
  onInviteAttached?: () => void;
}) {
  const [ctx, setCtx] = React.useState<ThreadCtx | null>(null);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const loadSlots = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/thread/${threadId}/meeting/slots`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? "Failed to load slots");
        return;
      }
      setSlots(Array.isArray(json.items) ? json.items : []);
    } finally {
      setIsLoading(false);
    }
  }, [threadId]);

  React.useEffect(() => {
    if (!threadId) return;
    let cancelled = false;

    async function hydrate() {
      const res = await fetch(`/api/thread/${threadId}/ctx`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? "Failed to load thread context");
        return;
      }
      if (!cancelled) {
        setCtx(json as ThreadCtx);
      }
      await loadSlots();
    }

    hydrate().catch((err) => {
      console.error(err);
      toast.error("Failed to load meeting data.");
    });

    return () => {
      cancelled = true;
    };
  }, [threadId, loadSlots]);

  const leadTz = ctx?.scheduling?.lead_tz ?? "America/New_York";
  const bookingLink = ctx?.scheduling?.booking_link ?? null;

  const formatRange = React.useCallback(
    (iso: string) =>
      new Date(iso).toLocaleString(undefined, {
        timeZone: leadTz,
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [leadTz],
  );

  async function attachIcs(queueId: string, slotId: string) {
    const res = await fetch(`/api/send-queue/${queueId}/attach-ics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: slotId, title: "Intro call" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      toast.error(`Attach failed: ${json?.error ?? "unknown"}`);
      return false;
    }
    toast.success("Calendar invite attached to draft.");
    onInviteAttached?.();
    return true;
  }

  async function confirm(slotId: string) {
    try {
      const res = await fetch(`/api/thread/${threadId}/meeting/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot_id: slotId,
          title: "Intro call",
          notes: "Agenda: quick audit + use cases.",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? "Failed to confirm slot");
        return false;
      }
      toast.success("Draft created with calendar links.");
      if (json.queue_id) {
        await attachIcs(json.queue_id, slotId);
      }
      await loadSlots();
      return true;
    } catch (err) {
      console.error(err);
      toast.error("Failed to confirm slot");
      return false;
    }
  }

  async function insertAlternativesIntoComposer(alternatives: AlternativeSlot[]) {
    if (!onSuggest) {
      toast.error("Composer is not available for this thread.");
      return false;
    }
    if (!alternatives.length) {
      toast.error("No alternatives to insert.");
      return false;
    }
    const leadTzValue = ctx?.scheduling?.lead_tz ?? "America/New_York";
    const duration = ctx?.scheduling?.duration_min ?? 30;
    const location = ctx?.scheduling?.location ?? "Google Meet";
    const booking = ctx?.scheduling?.auto_book_links ?? true;

    try {
      const res = await fetch(`/api/thread/${threadId}/meeting/suggest/explicit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_tz: leadTzValue,
          options: alternatives.map((alt) => ({
            start_utc: alt.start_utc,
            end_utc: alt.end_utc,
            url: alt.url,
          })),
          duration,
          location,
          booking,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || typeof json?.text !== "string") {
        toast.error(json?.error ?? "Failed to build alternative suggestions");
        return false;
      }
      onSuggest(json.text);
      toast.success(
        `Inserted ${alternatives.length} alternative${alternatives.length === 1 ? "" : "s"} into the composer.`,
      );
      return true;
    } catch (err) {
      console.error(err);
      toast.error("Failed to insert alternatives.");
      return false;
    }
  }

  async function suggestTopSlots() {
    if (!threadId) return;
    try {
      const res = await fetch(`/api/thread/${threadId}/meeting/suggest`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? "Failed to build suggestions");
        return;
      }
      if (!json?.text) {
        toast.info("No slots available yet.");
        return;
      }
      onSuggest?.(json.text);
      const count = typeof json?.n === "number" ? json.n : 3;
      toast.success(`Inserted ${count} suggested ${count === 1 ? "time" : "times"}.`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to build suggestions.");
    }
  }

  async function regenerate() {
    const res = await fetch(`/api/thread/${threadId}/meeting/regenerate`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      toast.error(`Failed to regenerate: ${json?.error ?? "unknown"}`);
      return;
    }
    await loadSlots();
    toast.success(`Regenerated ${json.nSlots ?? 0} slots.`);
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="font-medium">Meeting intent</div>
      <div className="text-xs text-muted-foreground">
        Times show in the lead's timezone (<span className="font-mono">{leadTz}</span>).
      </div>
      {bookingLink ? (
        <a href={bookingLink} target="_blank" rel="noreferrer" className="text-sm underline">
          Prefer my external scheduler
        </a>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          const conflict = Boolean(slot.rep_busy || slot.held);
          const reasons = [
            slot.held ? "Slot is currently on hold" : null,
            slot.rep_busy ? "Rep calendar conflict" : null,
          ]
            .filter(Boolean)
            .join(" • ");
          return (
            <div key={slot.id} className="space-y-2">
              <button
                disabled={conflict}
                onClick={() => confirm(slot.id)}
                className={`text-left rounded-md border p-2 transition ${
                  conflict ? "cursor-not-allowed opacity-60" : "hover:bg-muted"
                }`}
              >
                <div className="font-medium">
                  {formatRange(slot.start_utc)} → {formatRange(slot.end_utc)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Score {Math.round(slot.score * 10) / 10}
                </div>
                {conflict && reasons ? (
                  <div className="mt-1 text-xs text-amber-600">{reasons}</div>
                ) : null}
              </button>
              {conflict ? (
                <ConflictHelp
                  threadId={threadId}
                  slotId={slot.id}
                  leadTz={leadTz}
                  canInsert={Boolean(onSuggest)}
                  confirmSlot={confirm}
                  insertAlternatives={insertAlternativesIntoComposer}
                />
              ) : null}
            </div>
          );
        })}
        {!slots.length && !isLoading && (
          <div className="text-sm text-muted-foreground">
            No slots yet (waiting on parser). Try “Regenerate”.
          </div>
        )}
        {isLoading && <div className="text-sm text-muted-foreground">Loading slots…</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border px-3 py-2 text-sm hover:bg-muted transition"
          onClick={regenerate}
        >
          Regenerate
        </button>
        <button
          className="rounded-md border px-3 py-2 text-sm hover:bg-muted transition"
          onClick={suggestTopSlots}
          disabled={!slots.length}
        >
          Suggest 3 times
        </button>
      </div>
    </div>
  );
}


