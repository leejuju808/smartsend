"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { formatPhoneNumber } from "@/lib/phone-utils";

interface AppointmentBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  threadId: string;
  contactPhone?: string | null;
  contactAddress?: string | null;
  jobType?: string | null;
  onBookingComplete?: () => void;
}

export function AppointmentBookingModal({
  open,
  onOpenChange,
  contactId,
  threadId,
  contactPhone,
  contactAddress,
  jobType,
  onBookingComplete,
}: AppointmentBookingModalProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [address, setAddress] = useState(contactAddress || "");
  const [notes, setNotes] = useState("");
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load available times when date changes
  useEffect(() => {
    if (date && open) {
      loadAvailableTimes(date);
    }
  }, [date, open]);

  const loadAvailableTimes = async (selectedDate: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/inbox/available-times?date=${selectedDate}&duration=${duration}`
      );
      if (response.ok) {
        const data = await response.json();
        setAvailableTimes(data.times || []);
      }
    } catch (err) {
      console.error("Failed to load available times", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!date || !time) {
      alert("Please select a date and time");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/inbox/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          thread_id: threadId,
          date,
          time,
          duration_minutes: parseInt(duration),
          job_type: jobType,
          address: address || contactAddress,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create appointment");
      }

      const data = await response.json();
      
      // Log conversion
      await fetch("/api/inbox/jobs-conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          thread_id: threadId,
          appointment_id: data.appointment.id,
          conversion_type: "appointment_booked",
        }),
      });

      onBookingComplete?.();
      onOpenChange(false);
      
      // Reset form
      setDate("");
      setTime("");
      setAddress(contactAddress || "");
      setNotes("");
    } catch (err) {
      console.error("Failed to create appointment", err);
      alert("Failed to book appointment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Set minimum date to today
  const today = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Book Estimate Appointment</DialogTitle>
          <DialogDescription>
            Schedule an estimate appointment with {contactPhone ? formatPhoneNumber(contactPhone) : "the homeowner"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={today}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Time</label>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading available times...</div>
            ) : availableTimes.length === 0 && date ? (
              <div className="text-sm text-muted-foreground">No available times for this date</div>
            ) : (
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {availableTimes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Duration (minutes)</label>
            <Select value={duration} onValueChange={(v) => {
              setDuration(v);
              if (date) loadAvailableTimes(date);
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
                <SelectItem value="90">90 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Address</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter address"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Job Type</label>
            <Input
              value={jobType || ""}
              disabled
              placeholder="Auto-filled from AI"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this appointment..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!date || !time || saving}>
            {saving ? "Booking..." : "Book Appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

