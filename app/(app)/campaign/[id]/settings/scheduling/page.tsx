"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { TimeZoneSelect } from "@/components/TimeZoneSelect";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Prefs = {
  campaign_id: string;
  duration_min: number;
  tz: string | null;
  workdays: number[];
  start_hour: number;
  end_hour: number;
  buffer_min: number;
  location: string | null;
  booking_link: string | null;
  auto_insert_suggestions: boolean;
  suggestion_template: string | null;
  auto_book_links: boolean;
  confirmation_template: string | null;
};

const DEFAULTS: Partial<Prefs> = {
  duration_min: 30,
  tz: "America/Los_Angeles",
  workdays: [1, 2, 3, 4, 5],
  start_hour: 9,
  end_hour: 17,
  buffer_min: 15,
  location: "Google Meet",
  booking_link: null,
  auto_insert_suggestions: false,
  suggestion_template: null,
  auto_book_links: true,
  confirmation_template: null,
};

const DAYS = [
  { n: 1, name: "Mon" },
  { n: 2, name: "Tue" },
  { n: 3, name: "Wed" },
  { n: 4, name: "Thu" },
  { n: 5, name: "Fri" },
  { n: 6, name: "Sat" },
  { n: 7, name: "Sun" },
];

export default function SchedulingSettings() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [prefs, setPrefs] = React.useState<Prefs | null>(null);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      const r = await fetch(`/api/campaign/${campaignId}/meeting/prefs`, { cache: "no-store" });
      const j = await r.json();
      if (!ignore) {
        const merged = { ...DEFAULTS, ...(j.item || {}) } as Prefs;
        setPrefs(merged);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [campaignId]);

  function set<K extends keyof Prefs>(key: K, val: Prefs[K]) {
    setPrefs((p) => (p ? ({ ...p, [key]: val } as Prefs) : p));
  }

  async function save() {
    if (!prefs) return;
    setSaving(true);
    const r = await fetch(`/api/campaign/${campaignId}/meeting/prefs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        duration_min: prefs.duration_min,
        tz: prefs.tz ? prefs.tz : null,
        workdays: prefs.workdays,
        start_hour: prefs.start_hour,
        end_hour: prefs.end_hour,
        buffer_min: prefs.buffer_min,
        location: prefs.location,
        booking_link: prefs.booking_link ? prefs.booking_link : null,
        auto_insert_suggestions: prefs.auto_insert_suggestions,
        suggestion_template: prefs.suggestion_template ?? null,
        auto_book_links: prefs.auto_book_links,
        confirmation_template: prefs.confirmation_template ?? null,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (j.ok) alert("Scheduling preferences saved.");
    else alert(`Save failed: ${j.error?.message || j.error || "unknown"}`);
  }

  async function regenerateAllThreads() {
    // Optional: call a small admin page or list to trigger recompute per thread in this campaign.
    // For now, just inform the user how to regenerate per thread (button already exists in MeetingCard).
    alert("Per-thread: open a thread and click Regenerate to refresh slots with new prefs.");
  }

  if (loading || !prefs) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Scheduling</h1>

      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Timezone (IANA)</Label>
            <TimeZoneSelect value={prefs.tz || ""} onChange={(tz) => set("tz", tz)} />
            <p className="text-xs text-muted-foreground mt-1">
              Examples: America/Los_Angeles, America/New_York, Europe/London
            </p>
          </div>

          <div>
            <Label>Default Duration (min)</Label>
            <Input
              type="number"
              min={15}
              max={180}
              value={prefs.duration_min}
              onChange={(e) => set("duration_min", Number(e.target.value))}
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Workdays</Label>
            <div className="flex gap-2 flex-wrap mt-2">
              {DAYS.map((d) => {
                const checked = prefs.workdays.includes(d.n);
                return (
                  <label
                    key={d.n}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer select-none",
                      checked ? "bg-muted" : "",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v: any) => {
                        const on = Boolean(v);
                        set(
                          "workdays",
                          on
                            ? Array.from(new Set([...prefs.workdays, d.n])).sort((a, b) => a - b)
                            : prefs.workdays.filter((x) => x !== d.n),
                        );
                      }}
                    />
                    <span>{d.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Start Hour (0–23)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={prefs.start_hour}
              onChange={(e) => set("start_hour", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>End Hour (0–23)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={prefs.end_hour}
              onChange={(e) => set("end_hour", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">Must be greater than start hour.</p>
          </div>

          <div>
            <Label>Buffer (min)</Label>
            <Input
              type="number"
              min={0}
              max={240}
              value={prefs.buffer_min}
              onChange={(e) => set("buffer_min", Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Default Location</Label>
            <Input
              value={prefs.location || ""}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Google Meet / Zoom / Phone…"
            />
          </div>

          <div className="sm:col-span-2">
            <Label>External Booking Link (optional)</Label>
            <Input
              value={prefs.booking_link || ""}
              onChange={(e) => set("booking_link", e.target.value)}
              placeholder="https://cal.com/..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              If present, we’ll show a “Use external scheduler” link in thread UI.
            </p>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between border rounded-md p-3">
            <div>
              <Label>Auto-insert “Top 3 times” draft</Label>
              <p className="text-xs text-muted-foreground">
                When meeting intent is detected, create a reply draft with three options.
              </p>
            </div>
            <Switch
              checked={!!prefs.auto_insert_suggestions}
              onCheckedChange={(v) => set("auto_insert_suggestions", !!v)}
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between border rounded-md p-3">
            <div>
              <Label>Include “Book now” links</Label>
              <p className="text-xs text-muted-foreground">
                Add per-slot confirmation links in drafts and auto-inserted replies.
              </p>
            </div>
            <Switch checked={!!prefs.auto_book_links} onCheckedChange={(v) => set("auto_book_links", !!v)} />
          </div>

          <div className="sm:col-span-2">
            <Label>Suggestion Template (optional)</Label>
            <Textarea
              rows={8}
              placeholder={`Hi {lead_first},

Here are a few time options ({duration} min, {location} — showing in your local time):
{options}

{booking_link}

If none of these work, share a window that’s best for you and I’ll lock it in.

— SmartSend`}
              value={prefs.suggestion_template || ""}
              onChange={(e) => set("suggestion_template", e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Vars: {"{lead_first} {duration} {location} {options} {booking_link}"}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const threadId = prompt("Preview with Thread ID (must have slots)") || "";
                  if (!threadId) return;
                  const r = await fetch(`/api/campaign/${campaignId}/meeting/prefs/preview`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ thread_id: threadId, template: prefs.suggestion_template }),
                  });
                  const j = await r.json();
                  if (j.ok) alert(j.preview);
                  else alert(`Preview failed: ${j.error || "unknown"}`);
                }}
              >
                Preview template
              </Button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <Label>Confirmation Email Template (optional)</Label>
            <Textarea
              rows={10}
              placeholder={`Hi {lead_first},

Booked: **{start} – {end}**
Location: {location}

Add to calendar:
• Google: {gcal}
• Outlook: {outlook}

You'll also find an .ics invite attached.

— SmartSend`}
              value={prefs.confirmation_template || ""}
              onChange={(e) => set("confirmation_template", e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Vars: {"{lead_first} {duration} {location} {start} {end} {gcal} {outlook}"}
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" onClick={regenerateAllThreads}>
            Regenerate (per-thread)
          </Button>
        </div>
      </Card>
    </div>
  );
}


