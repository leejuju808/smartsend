"use client";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function toInputValue(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleDialog({
  campaignId,
}: {
  workspaceId: string;
  campaignId: string;
  selectableLeadIds: string[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const defaultStart = useMemo(() => toInputValue(new Date(Date.now() + 5 * 60 * 1000)), []);

  const [startAt, setStartAt] = useState<string>(defaultStart);
  const [endAt, setEndAt] = useState<string>("");
  const [windowStart, setWindowStart] = useState<number>(9);
  const [windowEnd, setWindowEnd] = useState<number>(17);
  const [days, setDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [balanceMode, setBalanceMode] = useState<"proportional" | "round_robin">("proportional");
  const [dripPerMinute, setDripPerMinute] = useState<number>(1);
  const [replyGuard, setReplyGuard] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const toggleDay = (day: string) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => DAYS.indexOf(a as any) - DAYS.indexOf(b as any))
    );
  };

  const onSchedule = async () => {
    if (!startAt) {
      toast({ title: "Start time required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        start_at: new Date(startAt).toISOString(),
        end_at: endAt ? new Date(endAt).toISOString() : null,
        drip_per_minute: dripPerMinute,
        tz_window: { start: windowStart, end: windowEnd },
        days,
        balance_mode: balanceMode,
        reply_guard: replyGuard,
      };

      const res = await fetch(`/api/campaigns/${campaignId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Unable to schedule campaign");
      }

      toast({
        title: "Campaign scheduled",
        description: `Drip starts at ${new Date(payload.start_at).toLocaleString()}`,
      });
      setOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast({ title: "Schedule error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Schedule</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Start</label>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">End (optional)</label>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Recipient window start</label>
              <Input
                type="number"
                min={0}
                max={23}
                value={windowStart}
                onChange={(e) => setWindowStart(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Recipient window end</label>
              <Input
                type="number"
                min={1}
                max={24}
                value={windowEnd}
                onChange={(e) => setWindowEnd(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Days</div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const selected = days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 text-sm rounded-md border ${
                      selected ? "bg-primary text-primary-foreground border-primary" : "border-muted text-muted-foreground"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Balance mode</label>
              <Select value={balanceMode} onValueChange={(value) => setBalanceMode(value as "proportional" | "round_robin")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proportional">Proportional</SelectItem>
                  <SelectItem value="round_robin">Round-robin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Drip per minute</label>
              <Input
                type="number"
                min={1}
                value={dripPerMinute}
                onChange={(e) => setDripPerMinute(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Reply-aware throttling</div>
              <p className="text-xs text-muted-foreground">Automatically tighten pace if replies spike.</p>
            </div>
            <Switch checked={replyGuard} onCheckedChange={setReplyGuard} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={onSchedule} disabled={saving}>
              {saving ? "Scheduling…" : "Schedule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
