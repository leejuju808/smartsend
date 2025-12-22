"use client";

import { useEffect, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Mail, PhoneCall, User, Building2, CalendarClock } from "lucide-react";
import { ReplyCategoryBadge } from "@/components/inbox/ReplyCategoryBadge";
import { LeadScoreCard } from "./LeadScoreCard";

type LeadProfile = {
  lead: any;
  campaigns: any[];
  replies: any[];
  meetings: any[];
  sends: any[];
  notes: any[];
  score?: {
    score: number;
    positive?: Record<string, number>;
    negative?: Record<string, number>;
    computed_at?: string;
  } | null;
  timeline: {
    type: "send" | "reply" | "meeting" | "note";
    at: string;
    data: any;
  }[];
};

type Props = {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
};

export function LeadProfileDrawer({ leadId, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<LeadProfile | null>(null);
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    if (!leadId || !open) return;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/leads/${leadId}/profile`);
        const json = await res.json();
        if (res.ok) {
          setProfile(json);
        }
      } catch (error) {
        console.error("Failed to load lead profile:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [leadId, open]);

  const lead = profile?.lead;

  return (
    <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent className="fixed right-0 top-0 bottom-0 w-full max-w-xl ml-auto border-l border-slate-800 bg-slate-950 text-slate-50">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  {lead
                    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() ||
                      lead.email
                    : "Lead"}
                </span>
                {lead && (
                  <span className="text-[11px] text-muted-foreground">
                    {lead.email}
                    {lead.company && ` · ${lead.company}`}
                  </span>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {loading && (
              <p className="text-xs text-muted-foreground">
                Loading lead profile…
              </p>
            )}

            {!loading && profile && (
              <>
                {/* Lead Score Card */}
                {profile.score && (
                  <LeadScoreCard
                    score={profile.score.score}
                    positive={profile.score.positive}
                    negative={profile.score.negative}
                    className="bg-slate-900/60"
                  />
                )}

                {/* Top summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card className="p-3 space-y-1 bg-slate-900/60">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[12px]">
                        Contact
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span>{lead.email}</span>
                    </div>
                    {lead.company && (
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span>{lead.company}</span>
                      </div>
                    )}
                    {lead.title && (
                      <div className="text-[11px] text-muted-foreground">
                        {lead.title}
                      </div>
                    )}
                    {lead.unsubscribed && (
                      <Badge className="bg-red-600 text-[10px] mt-1">
                        Unsubscribed
                      </Badge>
                    )}
                  </Card>

                  <Card className="p-3 space-y-1 bg-slate-900/60">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[12px]">
                        Campaigns
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {profile.campaigns.length} active
                      </span>
                    </div>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto">
                      {profile.campaigns.slice(0, 4).map((c, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="truncate mr-2">
                            {c.campaigns?.name || "Campaign"}
                          </span>
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {c.status}
                          </span>
                        </div>
                      ))}
                      {profile.campaigns.length === 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          No campaigns yet.
                        </span>
                      )}
                    </div>
                  </Card>

                  <Card className="p-3 space-y-1 bg-slate-900/60">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[12px]">
                        Meetings
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {profile.meetings.length} total
                      </span>
                    </div>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto">
                      {profile.meetings.slice(0, 3).map((m) => (
                        <div key={m.id}>
                          <div className="flex items-center gap-1">
                            <CalendarClock className="h-3 w-3 text-emerald-300" />
                            <span className="truncate">
                              {m.title || "Meeting"}
                            </span>
                          </div>
                          {m.start_time && (
                            <div className="text-[10px] text-muted-foreground ml-4">
                              {new Date(m.start_time).toLocaleString()}
                            </div>
                          )}
                        </div>
                      ))}
                      {profile.meetings.length === 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          No meetings yet.
                        </span>
                      )}
                    </div>
                  </Card>
                </div>

                {/* Notes section */}
                <div className="space-y-2">
                  <h2 className="text-[12px] font-semibold flex items-center gap-2">
                    Notes
                    <span className="text-[10px] text-muted-foreground">
                      Internal notes about this lead
                    </span>
                  </h2>

                  {/* Add note */}
                  <div className="border rounded-md bg-slate-950/70 p-2 space-y-2">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="w-full text-[11px] bg-transparent outline-none resize-none min-h-[60px]"
                      placeholder="Add a note about this lead (only visible to your team)…"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="xs"
                        disabled={noteSaving || !newNote.trim() || !lead}
                        onClick={async () => {
                          if (!lead) return;
                          setNoteSaving(true);
                          const res = await fetch(`/api/leads/${lead.id}/notes`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ body: newNote.trim() }),
                          });
                          const json = await res.json();
                          setNoteSaving(false);
                          if (res.ok) {
                            // Prepend note locally
                            const note = json.note;
                            setProfile((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    notes: [note, ...(prev.notes || [])],
                                    timeline: [
                                      {
                                        type: "note",
                                        at: note.created_at,
                                        data: note,
                                      },
                                      ...(prev.timeline || []),
                                    ].sort(
                                      (a, b) =>
                                        new Date(b.at).getTime() -
                                        new Date(a.at).getTime()
                                    ),
                                  }
                                : prev
                            );
                            setNewNote("");
                          }
                        }}
                      >
                        {noteSaving ? "Saving…" : "Add note"}
                      </Button>
                    </div>
                  </div>

                  {/* Existing notes list (pinned first) */}
                  <div className="space-y-1 max-h-[160px] overflow-y-auto">
                    {profile.notes && profile.notes.length > 0 ? (
                      profile.notes.map((n) => (
                        <div
                          key={n.id}
                          className="border rounded-md bg-slate-950/60 px-2 py-1.5 text-[11px] flex justify-between gap-2"
                        >
                          <div className="flex-1">
                            {n.pinned && (
                              <span className="text-[10px] text-amber-300 mr-2">
                                ★
                              </span>
                            )}
                            <span className="whitespace-pre-wrap">{n.body}</span>
                            <div className="text-[10px] text-muted-foreground mt-1">
                              {new Date(n.created_at).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-6 w-6 text-[10px]"
                              onClick={async () => {
                                const res = await fetch(
                                  `/api/leads/${lead.id}/notes/${n.id}`,
                                  {
                                    method: "PATCH",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({ pinned: !n.pinned }),
                                  }
                                );
                                const json = await res.json();
                                if (res.ok) {
                                  const updated = json.note;
                                  setProfile((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          notes: (prev.notes || [])
                                            .map((x) => (x.id === n.id ? updated : x))
                                            .sort((a, b) =>
                                              a.pinned === b.pinned
                                                ? new Date(b.created_at).getTime() -
                                                  new Date(a.created_at).getTime()
                                                : a.pinned
                                                ? -1
                                                : 1
                                            ),
                                        }
                                      : prev
                                  );
                                }
                              }}
                            >
                              {n.pinned ? "Unpin" : "Pin"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-6 w-6 text-[10px] text-red-400"
                              onClick={async () => {
                                const res = await fetch(
                                  `/api/leads/${lead.id}/notes/${n.id}`,
                                  { method: "DELETE" }
                                );
                                if (res.ok) {
                                  setProfile((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          notes: (prev.notes || []).filter(
                                            (x) => x.id !== n.id
                                          ),
                                          timeline: (prev.timeline || []).filter(
                                            (ev) =>
                                              !(
                                                ev.type === "note" &&
                                                ev.data?.id === n.id
                                              )
                                          ),
                                        }
                                      : prev
                                  );
                                }
                              }}
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        No notes yet. Add your first note above.
                      </p>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-2">
                  <h2 className="text-[12px] font-semibold flex items-center gap-2">
                    Activity timeline
                    <span className="text-[10px] text-muted-foreground">
                      Sends, replies, meetings
                    </span>
                  </h2>
                  {profile.timeline.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      No activity yet for this lead.
                    </p>
                  )}
                  <div className="space-y-2">
                    {profile.timeline.map((event, idx) => {
                      const date = new Date(event.at).toLocaleString();
                      if (event.type === "send") {
                        return (
                          <div
                            key={idx}
                            className="flex gap-2 text-[11px] items-start"
                          >
                            <div className="w-16 text-right text-muted-foreground">
                              {date}
                            </div>
                            <div className="w-px bg-slate-700 mx-2 mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center gap-1">
                                <Badge className="bg-sky-700 text-[10px]">
                                  SENT
                                </Badge>
                                <span className="font-semibold">
                                  {event.data.subject || "Sequence step"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (event.type === "reply") {
                        const r = event.data;
                        return (
                          <div
                            key={idx}
                            className="flex gap-2 text-[11px] items-start"
                          >
                            <div className="w-16 text-right text-muted-foreground">
                              {date}
                            </div>
                            <div className="w-px bg-slate-700 mx-2 mt-1" />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-1">
                                <Badge className="bg-emerald-700 text-[10px]">
                                  REPLY
                                </Badge>
                                <ReplyCategoryBadge category={r.ai_category} />
                              </div>
                              {r.ai_intent && (
                                <div className="text-[10px] text-emerald-300">
                                  AI: {r.ai_intent}
                                </div>
                              )}
                              <div className="text-[11px] text-muted-foreground line-clamp-3">
                                {r.body}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (event.type === "meeting") {
                        const m = event.data;
                        return (
                          <div
                            key={idx}
                            className="flex gap-2 text-[11px] items-start"
                          >
                            <div className="w-16 text-right text-muted-foreground">
                              {date}
                            </div>
                            <div className="w-px bg-slate-700 mx-2 mt-1" />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-purple-700 text-[10px]">
                                  MEETING
                                </Badge>
                                <span className="font-semibold">
                                  {m.title || "Meeting"}
                                </span>
                              </div>
                              {m.start_time && (
                                <div className="text-[10px] text-muted-foreground">
                                  Starts{" "}
                                  {new Date(m.start_time).toLocaleString()}
                                </div>
                              )}
                              {m.meeting_url && (
                                <a
                                  href={m.meeting_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-blue-300 underline"
                                >
                                  Join link
                                </a>
                              )}
                              {m.notes && (
                                <div className="text-[11px] text-muted-foreground line-clamp-3">
                                  {m.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      if (event.type === "note") {
                        const n = event.data;
                        return (
                          <div
                            key={idx}
                            className="flex gap-2 text-[11px] items-start"
                          >
                            <div className="w-16 text-right text-muted-foreground">
                              {new Date(event.at).toLocaleString()}
                            </div>
                            <div className="w-px bg-slate-700 mx-2 mt-1" />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-amber-700 text-[10px]">
                                  NOTE
                                </Badge>
                                {n.pinned && (
                                  <span className="text-[10px] text-amber-300">★ Pinned</span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                                {n.body}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
