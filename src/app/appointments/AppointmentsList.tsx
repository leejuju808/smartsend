"use client";

import { useState } from "react";
import { Calendar, MapPin, Clock, User, Phone, Mail, Check, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Appointment {
  id: string;
  homeowner_name: string | null;
  homeowner_address: string | null;
  homeowner_email: string | null;
  homeowner_phone: string | null;
  date: string;
  time: string;
  status: string;
  confirmation_sent: boolean;
  notes: string | null;
  lead_id: string | null;
}

export function AppointmentsList({
  appointments,
}: {
  appointments: Appointment[];
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmationMessages, setConfirmationMessages] = useState<
    Record<string, string>
  >({});

  // Group appointments by date
  const appointmentsByDate = appointments.reduce((acc, apt) => {
    const date = apt.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(apt);
    return acc;
  }, {} as Record<string, Appointment[]>);

  const handleComplete = async (appointmentId: string) => {
    setLoading(appointmentId);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/complete`, {
        method: "POST",
      });
      if (res.ok) {
        window.location.reload();
      } else {
        alert("Failed to mark appointment as completed");
      }
    } catch (error) {
      console.error("Error completing appointment:", error);
      alert("Failed to mark appointment as completed");
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async (appointmentId: string) => {
    if (!confirm("Are you sure you want to cancel this appointment?")) {
      return;
    }
    setLoading(appointmentId);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        window.location.reload();
      } else {
        alert("Failed to cancel appointment");
      }
    } catch (error) {
      console.error("Error canceling appointment:", error);
      alert("Failed to cancel appointment");
    } finally {
      setLoading(null);
    }
  };

  const handleGetConfirmation = async (appointment: Appointment) => {
    if (confirmationMessages[appointment.id]) {
      return;
    }
    try {
      const res = await fetch(`/api/appointments/${appointment.id}/confirmation`, {
        method: "GET",
      });
      if (res.ok) {
        const data = await res.json();
        setConfirmationMessages((prev) => ({
          ...prev,
          [appointment.id]: data.message,
        }));
      }
    } catch (error) {
      console.error("Error getting confirmation message:", error);
    }
  };

  const handleSendConfirmation = async (appointmentId: string) => {
    setLoading(appointmentId);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/send-confirmation`, {
        method: "POST",
      });
      if (res.ok) {
        alert("Confirmation message sent!");
        window.location.reload();
      } else {
        alert("Failed to send confirmation message");
      }
    } catch (error) {
      console.error("Error sending confirmation:", error);
      alert("Failed to send confirmation message");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      {Object.entries(appointmentsByDate)
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([date, dateAppointments]) => {
          const dateObj = new Date(date);
          const isToday =
            dateObj.toDateString() === new Date().toDateString();
          const isTomorrow =
            dateObj.toDateString() ===
            new Date(
              new Date().getTime() + 24 * 60 * 60 * 1000
            ).toDateString();

          let dateLabel = dateObj.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          });

          if (isToday) dateLabel = "Today";
          if (isTomorrow) dateLabel = "Tomorrow";

          return (
            <div key={date} className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{dateLabel}</h2>
                <span className="text-sm text-muted-foreground">
                  ({dateAppointments.length}{" "}
                  {dateAppointments.length === 1
                    ? "appointment"
                    : "appointments"}
                  )
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {dateAppointments.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    loading={loading === appointment.id}
                    confirmationMessage={confirmationMessages[appointment.id]}
                    onComplete={handleComplete}
                    onCancel={handleCancel}
                    onGetConfirmation={handleGetConfirmation}
                    onSendConfirmation={handleSendConfirmation}
                  />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function AppointmentCard({
  appointment,
  loading,
  confirmationMessage,
  onComplete,
  onCancel,
  onGetConfirmation,
  onSendConfirmation,
}: {
  appointment: Appointment;
  loading: boolean;
  confirmationMessage?: string;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onGetConfirmation: (apt: Appointment) => void;
  onSendConfirmation: (id: string) => void;
}) {
  return (
    <div className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{appointment.time}</span>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          {appointment.status}
        </span>
      </div>

      {appointment.homeowner_name && (
        <div className="flex items-center gap-2 mb-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {appointment.homeowner_name}
          </span>
        </div>
      )}

      {appointment.homeowner_address && (
        <div className="flex items-start gap-2 mb-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
          <span className="text-sm text-muted-foreground line-clamp-2">
            {appointment.homeowner_address}
          </span>
        </div>
      )}

      {appointment.homeowner_email && (
        <div className="flex items-center gap-2 mb-1">
          <Mail className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {appointment.homeowner_email}
          </span>
        </div>
      )}

      {appointment.homeowner_phone && (
        <div className="flex items-center gap-2 mb-3">
          <Phone className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {appointment.homeowner_phone}
          </span>
        </div>
      )}

      {appointment.notes && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground line-clamp-2">
            {appointment.notes}
          </p>
        </div>
      )}

      {confirmationMessage && (
        <div className="mt-3 pt-3 border-t">
          <div className="bg-muted/50 rounded p-2 mb-2">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {confirmationMessage}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => onSendConfirmation(appointment.id)}
            disabled={loading || appointment.confirmation_sent}
            className="w-full"
          >
            <Send className="h-3 w-3 mr-2" />
            {appointment.confirmation_sent
              ? "Already Sent"
              : "Send Confirmation"}
          </Button>
        </div>
      )}

      <div className="mt-4 pt-3 border-t flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onGetConfirmation(appointment)}
          className="flex-1"
          disabled={loading || !!confirmationMessage}
        >
          Get Message
        </Button>
        <Button
          size="sm"
          onClick={() => onComplete(appointment.id)}
          disabled={loading}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          <Check className="h-3 w-3 mr-1" />
          Complete
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCancel(appointment.id)}
          disabled={loading}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}


























