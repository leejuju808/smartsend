"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/Badge";
import { Flame, Snowflake, StickyNote, CalendarPlus } from "lucide-react";

type LeadIntent = "hot" | "warm" | "not_interested" | "other" | "unknown";
type LeadStatus = "new" | "working" | "booked" | "lost" | "cold";

type LeadActionsBarProps = {
  leadId: string;
  currentIntent: LeadIntent;
  currentStatus: LeadStatus;
  onUpdated?: () => void;
};

export function LeadActionsBar({
  leadId,
  currentIntent,
  currentStatus,
  onUpdated,
}: LeadActionsBarProps) {
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [noteText, setNoteText] = React.useState("");
  const [bookingTitle, setBookingTitle] = React.useState("");
  const [bookingDate, setBookingDate] = React.useState("");
  const [bookingValue, setBookingValue] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const updateIntent = async (intent: LeadIntent) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/intent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });

      if (!res.ok) {
        throw new Error("Failed to update intent");
      }

      onUpdated?.();
    } catch (err) {
      console.error("Error updating intent:", err);
    } finally {
      setLoading(false);
    }
  };

  const markCold = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/cold`, {
        method: "PATCH",
      });

      if (!res.ok) {
        throw new Error("Failed to mark as cold");
      }

      onUpdated?.();
    } catch (err) {
      console.error("Error marking as cold:", err);
    } finally {
      setLoading(false);
    }
  };

  const submitBooking = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/book-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bookingTitle || undefined,
          scheduled_date: bookingDate || undefined,
          estimated_value: bookingValue ? Number(bookingValue) : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to book job");
      }

      setBookingOpen(false);
      setBookingTitle("");
      setBookingDate("");
      setBookingValue("");
      onUpdated?.();
    } catch (err) {
      console.error("Error booking job:", err);
    } finally {
      setLoading(false);
    }
  };

  const submitNote = async () => {
    if (!noteText.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: noteText }),
      });

      if (!res.ok) {
        throw new Error("Failed to add note");
      }

      setNoteText("");
      setNotesOpen(false);
      onUpdated?.();
    } catch (err) {
      console.error("Error adding note:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            Status: {currentStatus}
          </Badge>
          <Badge
            variant="outline"
            className={getIntentBadgeClass(currentIntent)}
          >
            {currentIntent === "unknown" ? "Intent: unknown" : `${currentIntent} lead`}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Intent menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={loading}>
                <Flame className="mr-1 h-3 w-3" />
                Mark Intent
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Set lead intent</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => updateIntent("hot")}>
                🔥 Hot — ready to book
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateIntent("warm")}>
                🟡 Warm — interested
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateIntent("not_interested")}>
                ❌ Not interested
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateIntent("other")}>
                🤷 Other / unclear
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mark cold */}
          <Button
            variant="outline"
            size="sm"
            onClick={markCold}
            disabled={loading}
          >
            <Snowflake className="mr-1 h-3 w-3" />
            Mark Cold
          </Button>

          {/* Book job */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setBookingOpen(true)}
            disabled={loading}
          >
            <CalendarPlus className="mr-1 h-3 w-3" />
            Book Job
          </Button>

          {/* Add note */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNotesOpen(true)}
            disabled={loading}
          >
            <StickyNote className="mr-1 h-3 w-3" />
            Add Note
          </Button>
        </div>
      </div>

      {/* Booking dialog */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Job title</label>
              <Input
                placeholder="Roof replacement - Johnson"
                value={bookingTitle}
                onChange={(e) => setBookingTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Scheduled date</label>
              <Input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Estimated value ($)</label>
              <Input
                type="number"
                min={0}
                value={bookingValue}
                onChange={(e) => setBookingValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBookingOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submitBooking}
              disabled={loading}
            >
              Save Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note dialog */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Textarea
              rows={4}
              placeholder="Homeowner mentioned hail damage on the back side, wants afternoon appointments only..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotesOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submitNote}
              disabled={loading || !noteText.trim()}
            >
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getIntentBadgeClass(intent: LeadIntent) {
  switch (intent) {
    case "hot":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/40 dark:text-emerald-200";
    case "warm":
      return "bg-amber-500/10 text-amber-700 border-amber-500/40 dark:text-amber-200";
    case "not_interested":
      return "bg-slate-500/10 text-slate-700 border-slate-500/40 dark:text-slate-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}











































