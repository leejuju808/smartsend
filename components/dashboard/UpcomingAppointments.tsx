"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

interface Appointment {
  id: string;
  scheduled_for: string;
  source: "ai_hot_reply" | "estimator_call" | "manual";
  notes: string | null;
  leads: {
    id: string;
    name: string | null;
    email: string | null;
    city: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export function UpcomingAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAppointments() {
      try {
        const res = await fetch("/api/appointments/upcoming");
        if (res.ok) {
          const data = await res.json();
          setAppointments(data.appointments || []);
        }
      } catch (error) {
        console.error("Failed to fetch upcoming appointments:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAppointments();
  }, []);

  if (loading) {
    return (
      <Card className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-white">
            Upcoming Appointments
          </h2>
        </div>
        <div className="text-sm text-gray-400">Loading...</div>
      </Card>
    );
  }

  const appointmentCount = appointments.length;

  // Filter to only show upcoming appointments
  const upcomingAppointments = appointments.filter(
    (appt) => new Date(appt.scheduled_for) >= new Date()
  );

  return (
    <Card className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-white">
            Upcoming Appointments
          </h2>
        </div>
        <span className="text-xs text-gray-400">{upcomingAppointments.length}</span>
      </div>

      {upcomingAppointments.length === 0 ? (
        <div className="text-sm text-gray-400 py-4">
          No upcoming appointments
        </div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {upcomingAppointments.slice(0, 10).map((appt) => {
            const leadName =
              appt.leads?.name ||
              (appt.leads?.first_name && appt.leads?.last_name
                ? `${appt.leads.first_name} ${appt.leads.last_name}`
                : appt.leads?.email || "Unknown Lead");

            const scheduledDate = new Date(appt.scheduled_for);
            const dateStr = scheduledDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            const timeStr = scheduledDate.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });

            return (
              <Link
                key={appt.id}
                href={`/leads/${appt.leads?.id || "#"}`}
                className="flex justify-between text-sm hover:bg-white/5 rounded p-2 transition-colors"
              >
                <div className="text-white flex-1 min-w-0">
                  <div className="font-medium truncate">{leadName}</div>
                  {appt.leads?.city && (
                    <div className="text-xs text-gray-400">{appt.leads.city}</div>
                  )}
                </div>
                <div className="text-xs text-gray-300 ml-4 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>
                      {dateStr} {timeStr}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
          {upcomingAppointments.length > 10 && (
            <Link
              href="/appointments"
              className="block text-xs text-blue-400 hover:underline pt-2 text-center"
            >
              View all {upcomingAppointments.length} appointments →
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}










































