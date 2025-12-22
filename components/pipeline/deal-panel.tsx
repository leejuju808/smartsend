"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function DealPanel({
  deal,
  open,
  onOpenChange,
}: {
  deal: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    title: deal.title || "",
    stage: deal.stage || "new",
    value: deal.value || "",
    probability: deal.probability || 10,
    owner_id: deal.owner_id || "",
    next_action: deal.next_action || "",
    next_action_due: deal.next_action_due || "",
  });

  // Fetch deal activity timeline
  const { data: activityData, mutate: mutateActivity } = useSWR(
    open ? `/api/pipeline/deals/${deal.id}/activity` : null,
    fetcher
  );

  // Fetch team members for owner dropdown
  const { data: teamData } = useSWR("/api/team/list", fetcher);

  useEffect(() => {
    setFormData({
      title: deal.title || "",
      stage: deal.stage || "new",
      value: deal.value || "",
      probability: deal.probability || 10,
      owner_id: deal.owner_id || "",
      next_action: deal.next_action || "",
      next_action_due: deal.next_action_due || "",
    });
  }, [deal]);

  const handleSave = async () => {
    try {
      await fetch(`/api/pipeline/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      setIsEditing(false);
      onOpenChange(false);
      // Trigger refresh in parent
      window.dispatchEvent(new Event("deal-updated"));
    } catch (error) {
      console.error("Failed to update deal:", error);
    }
  };

  const lead = deal.leads || {};
  const owner = deal.owner || {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Deal Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Deal Title */}
          <div>
            <Label>Title</Label>
            {isEditing ? (
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1"
              />
            ) : (
              <p className="text-sm font-semibold mt-1">{deal.title}</p>
            )}
          </div>

          {/* Lead Link */}
          {lead.id && (
            <div>
              <Label>Lead</Label>
              <div className="mt-1">
                <Link
                  href={`/leads/${lead.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  {lead.first_name && lead.last_name
                    ? `${lead.first_name} ${lead.last_name}`
                    : lead.company || lead.email}
                </Link>
                {lead.company && (
                  <p className="text-xs text-muted-foreground mt-0.5">{lead.company}</p>
                )}
              </div>
            </div>
          )}

          {/* Stage */}
          <div>
            <Label>Stage</Label>
            {isEditing ? (
              <Select
                value={formData.stage}
                onValueChange={(v) => setFormData({ ...formData, stage: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="working">Working</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="closed_won">Closed Won</SelectItem>
                  <SelectItem value="closed_lost">Closed Lost</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm mt-1 capitalize">{deal.stage.replace("_", " ")}</p>
            )}
          </div>

          {/* Value */}
          <div>
            <Label>Value</Label>
            {isEditing ? (
              <Input
                type="number"
                value={formData.value}
                onChange={(e) =>
                  setFormData({ ...formData, value: parseInt(e.target.value) || 0 })
                }
                className="mt-1"
                placeholder="0"
              />
            ) : (
              <p className="text-sm mt-1">
                {deal.value
                  ? new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(deal.value)
                  : "—"}
              </p>
            )}
          </div>

          {/* Probability */}
          <div>
            <Label>Probability</Label>
            {isEditing ? (
              <div className="mt-1">
                <Input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.probability}
                  onChange={(e) =>
                    setFormData({ ...formData, probability: parseInt(e.target.value) })
                  }
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">{formData.probability}%</p>
              </div>
            ) : (
              <p className="text-sm mt-1">{deal.probability || 0}%</p>
            )}
          </div>

          {/* Owner */}
          <div>
            <Label>Owner</Label>
            {isEditing ? (
              <Select
                value={formData.owner_id}
                onValueChange={(v) => setFormData({ ...formData, owner_id: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {teamData?.members?.map((member: any) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.email || member.full_name || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm mt-1">
                {owner.email || owner.full_name || "Unassigned"}
              </p>
            )}
          </div>

          {/* Next Action */}
          <div>
            <Label>Next Action</Label>
            {isEditing ? (
              <Textarea
                value={formData.next_action}
                onChange={(e) => setFormData({ ...formData, next_action: e.target.value })}
                className="mt-1"
                placeholder="e.g., Send proposal"
              />
            ) : (
              <p className="text-sm mt-1">{deal.next_action || "—"}</p>
            )}
          </div>

          {/* Next Action Due */}
          {formData.next_action && (
            <div>
              <Label>Due Date</Label>
              {isEditing ? (
                <Input
                  type="date"
                  value={formData.next_action_due}
                  onChange={(e) =>
                    setFormData({ ...formData, next_action_due: e.target.value })
                  }
                  className="mt-1"
                />
              ) : (
                <p className="text-sm mt-1">
                  {deal.next_action_due
                    ? new Date(deal.next_action_due).toLocaleDateString()
                    : "—"}
                </p>
              )}
            </div>
          )}

          {/* Activity Timeline */}
          <div>
            <Label>Activity Timeline</Label>
            <div className="mt-2 space-y-3">
              {activityData?.activities ? (
                activityData.activities.map((activity: any) => (
                  <div key={activity.id} className="text-sm border-l-2 pl-3 py-1">
                    <p className="font-medium">{activity.type.replace("_", " ")}</p>
                    <p className="text-muted-foreground text-xs">{activity.body}</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No activity yet</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t">
            {isEditing ? (
              <>
                <Button onClick={handleSave}>Save</Button>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)}>Edit</Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}









