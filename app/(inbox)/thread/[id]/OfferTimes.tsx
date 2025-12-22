"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type OfferTimesProps = {
  threadId: string;
  campaignId: string;
  calendarId: string;
  onInsert: (text: string) => void;
};

type Slot = { start: string; end: string };

export function OfferTimes({ threadId, campaignId, calendarId, onInsert }: OfferTimesProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [selected, setSelected] = React.useState<Record<number, boolean>>({});

  const loadSlots = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/cal/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendar_id: calendarId,
          campaign_id: campaignId,
          count: 6,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { slots?: Slot[] };
      setSlots(data.slots ?? []);
      setSelected({});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load availability";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [calendarId, campaignId]);

  const createHolds = React.useCallback(async () => {
    const chosen = slots.filter((_, index) => selected[index]);
    if (chosen.length === 0) {
      toast.info("Pick at least one slot");
      return;
    }
    try {
      const response = await fetch("/api/cal/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          calendar_id: calendarId,
          slots: chosen,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
      if (blocks.length === 0) {
        toast.error("No holds created");
        return;
      }
      const lines = blocks
        .map((block: any) => `- ${block.label} - ${block.url}`)
        .join("\n");
      onInsert(
        `Great - here are a few times (pick one and it will auto-confirm):\n\n${lines}\n\nIf none work, just reply with a couple windows and I will send a hold.`,
      );
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create holds";
      toast.error(message);
    }
  }, [calendarId, onInsert, selected, slots, threadId]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(true);
          loadSlots();
        }}
        disabled={loading}
      >
        Offer times
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pick time options</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {loading && <div className="text-sm text-muted-foreground">Loading availability...</div>}
            {!loading && slots.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No availability found. Try again later or adjust calendar settings.
              </div>
            )}
            <div className="max-h-72 space-y-2 overflow-auto">
              {slots.map((slot, index) => (
                <label
                  key={`${slot.start}-${index}`}
                  className="flex items-center gap-2 rounded-lg border px-2 py-1 text-sm"
                >
                  <Checkbox
                    checked={Boolean(selected[index])}
                    onCheckedChange={(value) =>
                      setSelected((state) => ({ ...state, [index]: Boolean(value) }))
                    }
                  />
                  <span>
                    {new Date(slot.start).toLocaleString()} ->{" "}
                    {new Date(slot.end).toLocaleTimeString()}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createHolds} disabled={slots.length === 0}>
              Insert &amp; Hold
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

