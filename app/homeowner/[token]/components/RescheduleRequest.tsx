"use client";

// Block 94000 — Self-Serve Reschedule Request Component
// Homeowners can request to change their installation date

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Check } from "lucide-react";
import { toast } from "sonner";

interface RescheduleRequestProps {
  portalToken: string;
  jobId: string;
  currentScheduledDate?: string | null;
  onSubmitted?: () => void;
}

export function RescheduleRequest({
  portalToken,
  jobId,
  currentScheduledDate,
  onSubmitted,
}: RescheduleRequestProps) {
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState<"morning" | "afternoon" | "flexible">("flexible");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!preferredDate) {
      toast.error("Please select a preferred date");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/homeowner/reschedule-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          portal_token: portalToken,
          job_id: jobId,
          preferred_date: preferredDate,
          preferred_time: preferredTime,
          reason: reason.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit reschedule request");
      }

      toast.success("Reschedule request submitted! We'll contact you soon to confirm.");
      setPreferredDate("");
      setPreferredTime("flexible");
      setReason("");
      onSubmitted?.();
    } catch (error: any) {
      console.error("Error submitting reschedule request:", error);
      toast.error(error.message || "Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Get minimum date (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Need to Change Your Date?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentScheduledDate && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Currently scheduled:</span>{" "}
              {new Date(currentScheduledDate).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="preferred-date" className="text-base font-semibold">
            Preferred New Date
          </Label>
          <input
            id="preferred-date"
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            min={minDate}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500">
            Select your preferred date for installation
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferred-time" className="text-base font-semibold">
            Preferred Time
          </Label>
          <Select
            value={preferredTime}
            onValueChange={(value: "morning" | "afternoon" | "flexible") =>
              setPreferredTime(value)
            }
          >
            <SelectTrigger id="preferred-time">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning">Morning (8 AM - 12 PM)</SelectItem>
              <SelectItem value="afternoon">Afternoon (12 PM - 5 PM)</SelectItem>
              <SelectItem value="flexible">Flexible</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason" className="text-base font-semibold">
            Reason (Optional)
          </Label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Let us know why you need to reschedule..."
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!preferredDate || submitting}
          className="w-full"
        >
          {submitting ? (
            "Submitting..."
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Submit Reschedule Request
            </>
          )}
        </Button>

        <p className="text-xs text-gray-500 text-center">
          We'll review your request and contact you within 24 hours to confirm the new date.
        </p>
      </CardContent>
    </Card>
  );
}



























