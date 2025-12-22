// Block 20220 — Appointment Scheduler Card

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

interface AppointmentCardProps {
  conversationId: string;
  initialType?: string | null;
  initialAt?: string | null;
  initialStatus?: string | null;
  initialNotes?: string | null;
  initialAddressOverride?: string | null;
  onUpdated?: (patch: any) => void;
}

export function AppointmentCard({
  conversationId,
  initialType,
  initialAt,
  initialStatus,
  initialNotes,
  initialAddressOverride,
  onUpdated,
}: AppointmentCardProps) {
  const [type, setType] = useState(initialType || "inspection");
  const [dateTime, setDateTime] = useState(
    initialAt ? new Date(initialAt).toISOString().slice(0, 16) : ""
  ); // input type=datetime-local expects yyyy-MM-ddTHH:mm
  const [notes, setNotes] = useState(initialNotes || "");
  const [addrOverride, setAddrOverride] = useState(initialAddressOverride || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!dateTime) return;
    setSaving(true);

    try {
      const res = await fetch("/api/inbox/appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          appointment_type: type,
          appointment_at: new Date(dateTime).toISOString(),
          appointment_status: "scheduled",
          appointment_notes: notes || null,
          appointment_address_override: addrOverride || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to schedule appointment");
      }

      const json = await res.json();
      setSaving(false);

      if (json?.conversation && onUpdated) {
        onUpdated(json.conversation);
      }
    } catch (error) {
      console.error("Failed to schedule appointment:", error);
      setSaving(false);
      alert("Failed to schedule appointment. Please try again.");
    }
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base font-semibold">
                Schedule appointment
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                Set inspection or estimate time
              </p>
            </div>
          </div>
          {saving && (
            <span className="text-[10px] text-gray-400">Saving…</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 bg-white text-xs"
            >
              <option value="inspection">Inspection</option>
              <option value="estimate">Estimate</option>
              <option value="followup">Follow-up meeting</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Date & time
            </label>
            <input
              type="datetime-local"
              className="w-full border rounded-lg px-2 py-1 text-xs"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Address (optional)
            </label>
            <input
              type="text"
              className="w-full border rounded-lg px-2 py-1 text-xs"
              placeholder="Override homeowner address"
              value={addrOverride}
              onChange={(e) => setAddrOverride(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Notes</label>
            <textarea
              className="w-full border rounded-lg px-2 py-1 resize-none h-16 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mention details or expectations"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={!dateTime || saving}
            size="sm"
            className="px-3 py-1 rounded-full bg-black text-white text-xs disabled:opacity-50"
          >
            {saving ? "Saving…" : "Schedule"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

















































