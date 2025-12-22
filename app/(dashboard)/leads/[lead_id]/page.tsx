"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { LeadTimeline } from "@/components/leads/timeline";
import { LeadScoreCard } from "@/components/leads/LeadScoreCard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function LeadPage({ params }: { params: Promise<{ lead_id: string }> }) {
  const { lead_id } = use(params);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");

  const { data: profile, mutate: mutateProfile } = useSWR(
    `/api/leads/${lead_id}/profile`,
    fetcher
  );
  const { data: timelineData } = useSWR(`/api/leads/${lead_id}/timeline`, fetcher);

  const lead = profile?.lead;
  const cl = profile?.campaign_lead;
  const stats = profile?.stats;
  const score = profile?.score;

  async function saveField(field: string, e: React.FocusEvent<HTMLInputElement>) {
    const value = e.target.value;
    await fetch(`/api/leads/${lead_id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    mutateProfile();
  }

  async function updateReplyReason(campaign_lead_id: string, reason: string) {
    await fetch("/api/inbox/reply-reason", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_lead_id, reason }),
    });
    mutateProfile();
  }

  async function openFollowUpModal(campaign_lead_id: string) {
    setFollowUpModalOpen(true);
  }

  async function saveFollowUp() {
    if (!followUpDate || !cl) return;

    const followUpAt = new Date(followUpDate).toISOString();

    const res = await fetch("/api/inbox/follow-up/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_lead_id: cl.id,
        follow_up_at: followUpAt,
        follow_up_notes: followUpNotes,
      }),
    });

    if (res.ok) {
      setFollowUpModalOpen(false);
      setFollowUpDate("");
      setFollowUpNotes("");
      mutateProfile();
    } else {
      const error = await res.json();
      alert(error.error || "Failed to schedule follow-up");
    }
  }

  if (!lead) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="space-y-8 p-6">
      {/* ———————————————————————— */}
      {/* TOP PROFILE PANEL */}
      {/* ———————————————————————— */}
      <Card className="p-6 space-y-6">
        {/* HEADER */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold">
              {lead.first_name || ""} {lead.last_name || ""}
            </h1>
            <p className="text-sm text-muted-foreground">{lead.email}</p>
          </div>

          {/* Reply Reason */}
          {cl && (
            <Select
              value={cl.last_reply_reason ?? "uncategorized"}
              onValueChange={(reason) => updateReplyReason(cl.id, reason)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Reply reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="follow_up_later">Follow-Up Later</SelectItem>
                <SelectItem value="ooo">OOO</SelectItem>
                <SelectItem value="not_fit">Not a Fit</SelectItem>
                <SelectItem value="uncategorized">Uncategorized</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* EDITABLE FIELDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">First Name</label>
            <Input
              defaultValue={lead.first_name || ""}
              onBlur={(e) => saveField("first_name", e)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Last Name</label>
            <Input
              defaultValue={lead.last_name || ""}
              onBlur={(e) => saveField("last_name", e)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <Input
              defaultValue={lead.email || ""}
              onBlur={(e) => saveField("email", e)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Company</label>
            <Input
              defaultValue={lead.company || ""}
              onBlur={(e) => saveField("company", e)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Phone</label>
            <Input
              defaultValue={lead.phone || ""}
              onBlur={(e) => saveField("phone", e)}
            />
          </div>
        </div>

        {/* FOLLOW-UP INFO */}
        {cl && (
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm">
                <strong>Follow-Up:</strong>{" "}
                {cl.follow_up_at
                  ? format(new Date(cl.follow_up_at), "PPP p")
                  : "None"}
              </p>
              {cl.follow_up_completed && (
                <p className="text-xs text-green-600">Completed</p>
              )}
            </div>

            <Button variant="outline" onClick={() => openFollowUpModal(cl.id)}>
              Schedule Follow-Up
            </Button>
          </div>
        )}

        {/* LEAD SCORE */}
        {score && (
          <div className="border-t pt-4">
            <LeadScoreCard
              score={score.score}
              positive={score.positive}
              negative={score.negative}
            />
          </div>
        )}

        {/* STATS */}
        <div className="border-t pt-4">
          <h2 className="text-lg font-medium mb-2">Activity Stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Sent" value={stats?.sent} />
            <Stat label="Opens" value={stats?.open} />
            <Stat label="Clicks" value={stats?.click} />
            <Stat label="Replies" value={stats?.reply} />
          </div>
          {stats?.last_activity && (
            <p className="text-xs text-muted-foreground mt-2">
              Last activity: {format(new Date(stats.last_activity), "PPP p")}
            </p>
          )}
        </div>
      </Card>

      {/* ———————————————————————— */}
      {/* TIMELINE SECTION (Block 409) */}
      {/* ———————————————————————— */}
      <div className="w-full max-w-3xl mx-auto">
        <LeadTimeline items={timelineData?.items || []} />
      </div>

      {/* Follow-Up Modal */}
      {cl && (
        <Dialog open={followUpModalOpen} onOpenChange={setFollowUpModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Follow-Up</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Follow-Up Date & Time</label>
                <Input
                  type="datetime-local"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Notes (optional)</label>
                <Input
                  placeholder="Add any notes about this follow-up"
                  value={followUpNotes}
                  onChange={(e) => setFollowUpNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFollowUpModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveFollowUp} disabled={!followUpDate}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="p-3 rounded-md bg-muted/40 text-center">
      <div className="text-xl font-bold">{value ?? 0}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

