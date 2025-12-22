"use client";

import { useState } from "react";
import { X, Clock, MapPin, User, Phone, Mail, AlertCircle, Calendar, Edit2, Trash2, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { colors } from "../constants/colors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Appointment {
  id: string;
  contact_id: string;
  thread_id: string | null;
  job_id: string | null;
  date: string;
  time: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  appointment_type_id: string | null;
  appointment_type_name: string | null;
  appointment_type_color: string | null;
  appointment_type_icon: string | null;
  assigned_rep_id: string | null;
  assigned_rep_name: string | null;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  job_type: string | null;
  priority: string;
  status: string;
  notes: string | null;
  storm_related: boolean;
  location_address: string | null;
}

interface AppointmentDetailPanelProps {
  appointment: Appointment;
  onClose: () => void;
  onThreadSelect?: (threadId: string) => void;
  onAppointmentUpdate?: () => void;
}

export function AppointmentDetailPanel({
  appointment,
  onClose,
  onThreadSelect,
  onAppointmentUpdate,
}: AppointmentDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleThreadClick = () => {
    if (appointment.thread_id && onThreadSelect) {
      onThreadSelect(appointment.thread_id);
      onClose();
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "emergency":
        return "#EF4444";
      case "urgent":
        return "#F59E0B";
      case "high":
        return "#3B82F6";
      default:
        return colors.inkSecondary;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#10B981";
      case "cancelled":
        return "#6B7280";
      case "no_show":
        return "#EF4444";
      default:
        return colors.primary;
    }
  };

  return (
    <div
      className="fixed right-0 top-0 h-full w-[400px] border-l shadow-xl z-50 flex flex-col"
      style={{
        backgroundColor: colors.white,
        borderColor: colors.divider,
      }}
    >
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between" style={{ borderColor: colors.divider }}>
        <h3 className="text-lg font-semibold" style={{ color: colors.ink }}>
          Appointment Details
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          style={{ color: colors.inkSecondary }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Appointment Type & Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {appointment.appointment_type_name && (
            <Badge
              style={{
                backgroundColor: appointment.appointment_type_color || colors.primary,
                color: "white",
              }}
            >
              {appointment.appointment_type_name}
            </Badge>
          )}
          <Badge
            variant="outline"
            style={{
              borderColor: getStatusColor(appointment.status),
              color: getStatusColor(appointment.status),
            }}
          >
            {appointment.status}
          </Badge>
          {appointment.priority !== "normal" && (
            <Badge
              variant="outline"
              style={{
                borderColor: getPriorityColor(appointment.priority),
                color: getPriorityColor(appointment.priority),
              }}
            >
              {appointment.priority}
            </Badge>
          )}
          {appointment.storm_related && (
            <Badge variant="outline" style={{ borderColor: "#EF4444", color: "#EF4444" }}>
              <AlertCircle className="h-3 w-3 mr-1" />
              Storm Related
            </Badge>
          )}
        </div>

        {/* Date & Time */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" style={{ color: colors.inkSecondary }} />
            <span className="text-sm font-medium" style={{ color: colors.ink }}>
              {format(parseISO(appointment.start_time), "EEEE, MMMM d, yyyy")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: colors.inkSecondary }} />
            <span className="text-sm" style={{ color: colors.inkSecondary }}>
              {format(parseISO(appointment.start_time), "h:mm a")} - {format(parseISO(appointment.end_time), "h:mm a")}
            </span>
            <span className="text-xs" style={{ color: colors.inkSecondary }}>
              ({appointment.duration_minutes} min)
            </span>
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold" style={{ color: colors.ink }}>
            Contact Information
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" style={{ color: colors.inkSecondary }} />
              <span className="text-sm" style={{ color: colors.ink }}>
                {appointment.contact_name}
              </span>
            </div>
            {appointment.contact_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" style={{ color: colors.inkSecondary }} />
                <a
                  href={`tel:${appointment.contact_phone}`}
                  className="text-sm hover:underline"
                  style={{ color: colors.primary }}
                >
                  {appointment.contact_phone}
                </a>
              </div>
            )}
            {appointment.contact_email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" style={{ color: colors.inkSecondary }} />
                <a
                  href={`mailto:${appointment.contact_email}`}
                  className="text-sm hover:underline"
                  style={{ color: colors.primary }}
                >
                  {appointment.contact_email}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Address */}
        {appointment.address && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold" style={{ color: colors.ink }}>
              Address
            </h4>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.inkSecondary }} />
              <span className="text-sm" style={{ color: colors.ink }}>
                {appointment.address}
              </span>
            </div>
          </div>
        )}

        {/* Assigned Rep */}
        {appointment.assigned_rep_name && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold" style={{ color: colors.ink }}>
              Assigned Rep
            </h4>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" style={{ color: colors.inkSecondary }} />
              <span className="text-sm" style={{ color: colors.ink }}>
                {appointment.assigned_rep_name}
              </span>
            </div>
          </div>
        )}

        {/* Job Type */}
        {appointment.job_type && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold" style={{ color: colors.ink }}>
              Job Type
            </h4>
            <Badge variant="outline">{appointment.job_type}</Badge>
          </div>
        )}

        {/* Notes */}
        {appointment.notes && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold" style={{ color: colors.ink }}>
              Notes
            </h4>
            <p className="text-sm" style={{ color: colors.inkSecondary }}>
              {appointment.notes}
            </p>
          </div>
        )}

        {/* Thread Link */}
        {appointment.thread_id && (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleThreadClick}
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Thread
            </Button>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t p-4 flex gap-2" style={{ borderColor: colors.divider }}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(true)}
          className="flex-1"
        >
          <Edit2 className="h-4 w-4 mr-2" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="flex-1"
        >
          Close
        </Button>
      </div>
    </div>
  );
}



















































