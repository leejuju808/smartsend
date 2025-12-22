"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";

interface Appointment {
  id: string;
  scheduled_for: string;
  source: "ai_hot_reply" | "estimator_call" | "manual";
  notes: string | null;
  created_at: string;
}

interface LeadAppointmentsProps {
  leadId: string;
}

export function LeadAppointments({ leadId }: LeadAppointmentsProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAppointments() {
      try {
        const res = await fetch(`/api/appointments?lead_id=${leadId}`);
        if (res.ok) {
          const data = await res.json();
          setAppointments(data.appointments || []);
        }
      } catch (error) {
        console.error("Failed to fetch appointments:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAppointments();
  }, [leadId]);

  if (loading) {
    return (
      <div className="bg-white p-4 rounded-xl border">
        <h2 className="text-lg font-semibold mb-3">Appointments</h2>
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!appointments || appointments.length === 0) {
    return (
      <div className="bg-white p-4 rounded-xl border">
        <h2 className="text-lg font-semibold mb-3">Appointments</h2>
        <div className="text-sm text-gray-400">No appointments yet.</div>
      </div>
    );
  }

  // Sort by scheduled_for date (upcoming first)
  const sortedAppointments = [...appointments].sort((a, b) => {
    return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
  });

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "ai_hot_reply":
        return "AI Auto-Booked";
      case "estimator_call":
        return "From Call";
      case "manual":
        return "Manual";
      default:
        return source;
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "ai_hot_reply":
        return "bg-blue-100 text-blue-700";
      case "estimator_call":
        return "bg-green-100 text-green-700";
      case "manual":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl border space-y-3">
      <h2 className="text-lg font-semibold">Appointments</h2>

      <div className="space-y-2">
        {sortedAppointments.map((appt) => {
          const scheduledDate = new Date(appt.scheduled_for);
          const isPast = scheduledDate < new Date();
          const dateStr = scheduledDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const timeStr = scheduledDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });

          return (
            <div
              key={appt.id}
              className={`p-3 rounded-lg border ${
                isPast
                  ? "bg-gray-50 border-gray-200 opacity-60"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <div className="text-gray-900 text-sm font-semibold">
                      {dateStr} at {timeStr}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${getSourceColor(
                        appt.source
                      )}`}
                    >
                      {getSourceLabel(appt.source)}
                    </span>
                  </div>
                  {appt.notes && (
                    <div className="text-xs text-gray-600 mt-1">{appt.notes}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

