"use client";

import { useEffect, useState, useMemo } from "react";
import { format, startOfWeek, endOfWeek, addDays, addWeeks, isSameDay, parseISO, getHours, getMinutes, startOfDay, addHours } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, User, Phone, Mail, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { colors } from "../constants/colors";
import { AppointmentDetailPanel } from "./AppointmentDetailPanel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CalendarView = "day" | "3day" | "week";

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

export function CalendarTab({ onThreadSelect }: { onThreadSelect?: (threadId: string) => void }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("week");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedRepId, setSelectedRepId] = useState<string>("all");
  const [reps, setReps] = useState<Array<{ id: string; name: string; email: string }>>([]);

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    if (view === "day") {
      const start = startOfDay(currentDate);
      const end = addHours(start, 23);
      return { start: start.toISOString(), end: end.toISOString() };
    } else if (view === "3day") {
      const start = startOfDay(currentDate);
      const end = addDays(start, 2);
      end.setHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    } else {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return { start: start.toISOString(), end: end.toISOString() };
    }
  }, [currentDate, view]);

  // Fetch appointments
  useEffect(() => {
    fetchAppointments();
  }, [dateRange, selectedRepId]);

  // Fetch reps
  useEffect(() => {
    fetchReps();
  }, []);

  const fetchReps = async () => {
    try {
      const response = await fetch("/api/inbox/calendar/reps");
      if (response.ok) {
        const data = await response.json();
        setReps(data.reps || []);
      }
    } catch (error) {
      console.error("Error fetching reps:", error);
    }
  };

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
        rep_id: selectedRepId,
      });
      const response = await fetch(`/api/inbox/calendar/appointments?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAppointments(data.appointments || []);
      }
    } catch (error) {
      console.error("Error fetching appointments:", error);
    } finally {
      setLoading(false);
    }
  };

  const navigateDate = (direction: "prev" | "next") => {
    if (view === "day") {
      setCurrentDate(addDays(currentDate, direction === "next" ? 1 : -1));
    } else if (view === "3day") {
      setCurrentDate(addDays(currentDate, direction === "next" ? 3 : -3));
    } else {
      setCurrentDate(addWeeks(currentDate, direction === "next" ? 1 : -1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {};
    appointments.forEach((apt) => {
      const dateKey = format(parseISO(apt.start_time), "yyyy-MM-dd");
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(apt);
    });
    return grouped;
  }, [appointments]);

  // Get dates to display
  const displayDates = useMemo(() => {
    if (view === "day") {
      return [currentDate];
    } else if (view === "3day") {
      return [currentDate, addDays(currentDate, 1), addDays(currentDate, 2)];
    } else {
      const start = startOfWeek(currentDate);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
  }, [currentDate, view]);

  // Hours to display (8 AM to 8 PM)
  const hours = Array.from({ length: 13 }, (_, i) => i + 8);

  const getAppointmentsForSlot = (date: Date, hour: number) => {
    const dateKey = format(date, "yyyy-MM-dd");
    const dayAppointments = appointmentsByDate[dateKey] || [];
    return dayAppointments.filter((apt) => {
      const aptStart = parseISO(apt.start_time);
      const aptHour = getHours(aptStart);
      return aptHour === hour || (aptHour < hour && getHours(parseISO(apt.end_time)) > hour);
    });
  };

  const getAppointmentStyle = (apt: Appointment) => {
    const start = parseISO(apt.start_time);
    const end = parseISO(apt.end_time);
    const startMinutes = getHours(start) * 60 + getMinutes(start);
    const endMinutes = getHours(end) * 60 + getMinutes(end);
    const duration = endMinutes - startMinutes;
    const topPercent = ((startMinutes - 8 * 60) / (13 * 60)) * 100;
    const heightPercent = (duration / (13 * 60)) * 100;

    return {
      top: `${topPercent}%`,
      height: `${Math.max(heightPercent, 4)}%`,
      backgroundColor: apt.appointment_type_color || colors.primary,
      borderLeft: `3px solid ${apt.priority === "urgent" || apt.priority === "emergency" ? "#EF4444" : apt.appointment_type_color || colors.primary}`,
    };
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: colors.white }}>
      {/* Calendar Header */}
      <div className="border-b p-4" style={{ borderColor: colors.divider }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate("prev")}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
                className="h-8 px-3"
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate("next")}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-lg font-semibold" style={{ color: colors.ink }}>
              {view === "day"
                ? format(currentDate, "EEEE, MMMM d, yyyy")
                : view === "3day"
                ? `${format(displayDates[0], "MMM d")} - ${format(displayDates[displayDates.length - 1], "MMM d, yyyy")}`
                : `${format(displayDates[0], "MMM d")} - ${format(displayDates[displayDates.length - 1], "MMM d, yyyy")}`}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedRepId} onValueChange={setSelectedRepId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Reps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reps</SelectItem>
                {reps.map((rep) => (
                  <SelectItem key={rep.id} value={rep.id}>
                    {rep.name || rep.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1 border rounded-lg" style={{ borderColor: colors.divider }}>
              <button
                onClick={() => setView("day")}
                className={`px-3 py-1.5 text-sm font-medium rounded-l-lg transition-all ${
                  view === "day" ? "text-white" : ""
                }`}
                style={{
                  backgroundColor: view === "day" ? colors.primary : "transparent",
                  color: view === "day" ? "white" : colors.inkSecondary,
                }}
              >
                Day
              </button>
              <button
                onClick={() => setView("3day")}
                className={`px-3 py-1.5 text-sm font-medium transition-all ${
                  view === "3day" ? "text-white" : ""
                }`}
                style={{
                  backgroundColor: view === "3day" ? colors.primary : "transparent",
                  color: view === "3day" ? "white" : colors.inkSecondary,
                }}
              >
                3-Day
              </button>
              <button
                onClick={() => setView("week")}
                className={`px-3 py-1.5 text-sm font-medium rounded-r-lg transition-all ${
                  view === "week" ? "text-white" : ""
                }`}
                style={{
                  backgroundColor: view === "week" ? colors.primary : "transparent",
                  color: view === "week" ? "white" : colors.inkSecondary,
                }}
              >
                Week
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="flex h-full">
            {/* Time column */}
            <div className="w-20 border-r flex-shrink-0" style={{ borderColor: colors.divider }}>
              <div className="h-12 border-b" style={{ borderColor: colors.divider }}></div>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="h-16 border-b flex items-start justify-end pr-2 pt-1 text-xs"
                  style={{ borderColor: colors.divider, color: colors.inkSecondary }}
                >
                  {format(new Date().setHours(hour, 0, 0, 0), "h a")}
                </div>
              ))}
            </div>

            {/* Date columns */}
            <div className="flex-1 flex">
              {displayDates.map((date, dateIndex) => {
                const dateKey = format(date, "yyyy-MM-dd");
                const dayAppointments = appointmentsByDate[dateKey] || [];
                const isToday = isSameDay(date, new Date());

                return (
                  <div
                    key={dateKey}
                    className="flex-1 border-r last:border-r-0"
                    style={{ borderColor: colors.divider }}
                  >
                    {/* Date header */}
                    <div
                      className="h-12 border-b p-2 text-center"
                      style={{
                        borderColor: colors.divider,
                        backgroundColor: isToday ? colors.primaryLight : "transparent",
                      }}
                    >
                      <div className="text-xs font-medium" style={{ color: colors.inkSecondary }}>
                        {format(date, "EEE")}
                      </div>
                      <div
                        className={`text-sm font-semibold mt-0.5 ${
                          isToday ? "text-white" : ""
                        }`}
                        style={{
                          color: isToday ? colors.primary : colors.ink,
                        }}
                      >
                        {format(date, "d")}
                      </div>
                    </div>

                    {/* Time slots */}
                    <div className="relative">
                      {hours.map((hour) => {
                        const slotAppointments = getAppointmentsForSlot(date, hour);
                        return (
                          <div
                            key={hour}
                            className="h-16 border-b relative"
                            style={{ borderColor: colors.divider }}
                          >
                            {slotAppointments.map((apt) => {
                              const style = getAppointmentStyle(apt);
                              return (
                                <div
                                  key={apt.id}
                                  className="absolute left-1 right-1 rounded px-2 py-1 cursor-pointer hover:opacity-90 transition-all text-white text-xs font-medium shadow-sm"
                                  style={style}
                                  onClick={() => setSelectedAppointment(apt)}
                                >
                                  <div className="flex items-center gap-1 truncate">
                                    <Clock className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">
                                      {format(parseISO(apt.start_time), "h:mm a")}
                                    </span>
                                  </div>
                                  <div className="truncate font-semibold mt-0.5">
                                    {apt.contact_name}
                                  </div>
                                  {apt.appointment_type_name && (
                                    <div className="truncate text-[10px] opacity-90">
                                      {apt.appointment_type_name}
                                    </div>
                                  )}
                                  {apt.storm_related && (
                                    <AlertCircle className="h-3 w-3 absolute top-1 right-1" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Appointment Detail Panel */}
      {selectedAppointment && (
        <AppointmentDetailPanel
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onThreadSelect={onThreadSelect}
          onAppointmentUpdate={fetchAppointments}
        />
      )}
    </div>
  );
}



















































