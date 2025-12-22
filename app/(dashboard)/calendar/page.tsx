"use client";

// Block 13300 — Calendar & Scheduling Sync v1
// Block 20800 — Roofing Calendar Sync v1 (extends with roofing events)
// Calendar page with Month/Week/Day views

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, ChevronLeft, ChevronRight, Home, CheckCircle2, Phone, Clock, MapPin, User, Edit2, Wrench, AlertCircle, Calendar as CalendarIcon, Sparkles, Zap } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks, isSameDay, isSameMonth, parseISO, getHours } from "date-fns";
import Link from "next/link";

type CalendarEvent = {
  id: string;
  type: "inspection" | "task" | "adjuster_appt" | "install_date" | "follow_up" | "inspection_event";
  title: string;
  start: string;
  end?: string;
  contactId?: string;
  taskId?: string;
  jobId?: string;
  threadId?: string;
  eventId?: string;
  assignedTo?: { id: string; name: string } | null;
  status?: "open" | "completed" | "scheduled" | "cancelled" | "rescheduled";
  pipelineStage?: string | null;
  notes?: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  priority?: "low" | "normal" | "high";
  autoType?: string;
  // Block 20800 fields
  claimNumber?: string;
  carrier?: string;
  jobValue?: number;
  metadata?: Record<string, any>;
  // Block 21320 fields
  autoScheduled?: boolean;
  autoScheduleReason?: string;
  autoScheduleTrigger?: string;
  assignedToRole?: string;
  timingReason?: string;
  conflictDetected?: boolean;
};

type ViewType = "month" | "week" | "day";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  
  // Filters
  const [showInspections, setShowInspections] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [showAdjusterAppts, setShowAdjusterAppts] = useState(true);
  const [showInstallDates, setShowInstallDates] = useState(true);
  const [showFollowUps, setShowFollowUps] = useState(true);
  const [assignedTo, setAssignedTo] = useState<string>("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.id) {
          setCurrentUserId(data.id);
        }
      });
  }, []);

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    if (view === "month") {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      return { start: start.toISOString(), end: end.toISOString() };
    } else if (view === "week") {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return { start: start.toISOString(), end: end.toISOString() };
    } else {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }
  }, [currentDate, view]);

  // Fetch events
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const types = [];
        if (showInspections) types.push("inspection");
        if (showTasks) types.push("task");
        if (showAdjusterAppts) types.push("adjuster_appt");
        if (showInstallDates) types.push("install_date");
        if (showFollowUps) types.push("follow_up");

        const url = new URL("/api/calendar/events", window.location.origin);
        url.searchParams.set("start", dateRange.start);
        url.searchParams.set("end", dateRange.end);
        url.searchParams.set("assignedTo", assignedTo);
        url.searchParams.set("types", types.join(","));

        const response = await fetch(url.toString());
        const data = await response.json();
        setEvents(data.events || []);
      } catch (error) {
        console.error("Error fetching events:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [dateRange, showInspections, showTasks, showAdjusterAppts, showInstallDates, showFollowUps, assignedTo]);

  // Navigation
  const goToToday = () => setCurrentDate(new Date());
  const goToPrevious = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, -1));
    else if (view === "week") setCurrentDate(addWeeks(currentDate, -1));
    else setCurrentDate(addDays(currentDate, -1));
  };
  const goToNext = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  // Filter events for a specific day
  const getEventsForDay = (date: Date) => {
    return events.filter((event) => {
      const eventDate = parseISO(event.start);
      return isSameDay(eventDate, date);
    });
  };

  // Get events for a specific hour (for week/day view)
  const getEventsForHour = (date: Date, hour: number) => {
    return events.filter((event) => {
      const eventDate = parseISO(event.start);
      return isSameDay(eventDate, date) && getHours(eventDate) === hour;
    });
  };

  // Render month view
  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    const days = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }

    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        {/* Header */}
        {weekDays.map((day) => (
          <div key={day} className="bg-gray-50 p-2 text-center text-sm font-medium text-gray-700">
            {day}
          </div>
        ))}

        {/* Days */}
        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={`bg-white min-h-[100px] p-1 ${!isCurrentMonth ? "opacity-50" : ""} ${isToday ? "ring-2 ring-blue-500" : ""}`}
            >
              <div className={`text-sm font-medium mb-1 ${isToday ? "text-blue-600" : ""}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`text-xs p-1 rounded cursor-pointer truncate ${
                      event.type === "inspection" || event.type === "inspection_event"
                        ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                        : event.type === "adjuster_appt"
                        ? "bg-purple-100 text-purple-800 hover:bg-purple-200"
                        : event.type === "install_date"
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : event.type === "follow_up"
                        ? "bg-orange-100 text-orange-800 hover:bg-orange-200"
                        : event.autoType
                        ? "bg-orange-100 text-orange-800 hover:bg-orange-200"
                        : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                    } ${event.autoScheduled ? "ring-1 ring-purple-400" : ""}`}
                  >
                    {event.autoScheduled && <Sparkles className="h-2 w-2 inline mr-1" />}
                    {format(parseISO(event.start), "h:mm a")} — {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-gray-500">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render week view
  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8am to 8pm

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-8 border-b bg-gray-50">
          <div className="p-2 border-r"></div>
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="p-2 text-center border-r last:border-r-0">
              <div className="text-sm font-medium">{format(day, "EEE")}</div>
              <div className={`text-lg ${isSameDay(day, new Date()) ? "text-blue-600 font-bold" : ""}`}>
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-8">
          <div className="border-r">
            {hours.map((hour) => (
              <div key={hour} className="h-16 border-b p-1 text-xs text-gray-500">
                {hour}:00
              </div>
            ))}
          </div>
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="border-r last:border-r-0">
              {hours.map((hour) => {
                const hourEvents = getEventsForHour(day, hour);
                return (
                  <div key={hour} className="h-16 border-b p-1 relative">
                    {hourEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        className={`absolute left-1 right-1 text-xs p-1 rounded cursor-pointer ${
                          event.type === "inspection" || event.type === "inspection_event"
                            ? "bg-blue-100 text-blue-800"
                            : event.type === "adjuster_appt"
                            ? "bg-purple-100 text-purple-800"
                            : event.type === "install_date"
                            ? "bg-green-100 text-green-800"
                            : event.type === "follow_up"
                            ? "bg-orange-100 text-orange-800"
                            : event.autoType
                            ? "bg-orange-100 text-orange-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {format(parseISO(event.start), "h:mm")} — {event.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render day view
  const renderDayView = () => {
    const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8am to 8pm
    const dayEvents = getEventsForDay(currentDate);

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 p-4 border-b">
          <div className="text-lg font-semibold">{format(currentDate, "EEEE, MMMM d, yyyy")}</div>
        </div>
        <div className="grid grid-cols-2">
          <div className="border-r">
            {hours.map((hour) => (
              <div key={hour} className="h-16 border-b p-2 flex items-center">
                <span className="text-sm text-gray-500">{hour}:00</span>
              </div>
            ))}
          </div>
          <div>
            {hours.map((hour) => {
              const hourEvents = getEventsForHour(currentDate, hour);
              return (
                <div key={hour} className="h-16 border-b p-2">
                  {hourEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      className={`mb-1 p-2 rounded cursor-pointer ${
                        event.type === "inspection" || event.type === "inspection_event"
                          ? "bg-blue-100 text-blue-800"
                          : event.type === "adjuster_appt"
                          ? "bg-purple-100 text-purple-800"
                          : event.type === "install_date"
                          ? "bg-green-100 text-green-800"
                          : event.type === "follow_up"
                          ? "bg-orange-100 text-orange-800"
                          : event.autoType
                          ? "bg-orange-100 text-orange-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      <div className="font-medium">{event.title}</div>
                      <div className="text-xs">{format(parseISO(event.start), "h:mm a")}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        {dayEvents.length === 0 && (
          <div className="p-8 text-center text-gray-500">No events scheduled for this day</div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-gray-500">View inspections, tasks, and follow-ups</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={goToToday}>
            <Home className="h-4 w-4 mr-2" />
            Today
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between bg-white p-4 rounded-lg border">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={goToPrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-lg font-semibold">
            {view === "month" && format(currentDate, "MMMM yyyy")}
            {view === "week" && `Week of ${format(startOfWeek(currentDate), "MMM d")}`}
            {view === "day" && format(currentDate, "MMMM d, yyyy")}
          </div>
          <Button variant="outline" size="sm" onClick={goToNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-4">
          {/* View Toggle */}
          <div className="flex gap-1 border rounded-lg p-1">
            {(["month", "week", "day"] as ViewType[]).map((v) => (
              <Button
                key={v}
                variant={view === v ? "default" : "ghost"}
                size="sm"
                onClick={() => setView(v)}
                className="capitalize"
              >
                {v}
              </Button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="inspections"
                checked={showInspections}
                onCheckedChange={(checked) => setShowInspections(checked === true)}
              />
              <label htmlFor="inspections" className="text-sm cursor-pointer">
                Inspections
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="tasks"
                checked={showTasks}
                onCheckedChange={(checked) => setShowTasks(checked === true)}
              />
              <label htmlFor="tasks" className="text-sm cursor-pointer">
                Tasks
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="adjuster_appts"
                checked={showAdjusterAppts}
                onCheckedChange={(checked) => setShowAdjusterAppts(checked === true)}
              />
              <label htmlFor="adjuster_appts" className="text-sm cursor-pointer">
                Adjuster Appts
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="install_dates"
                checked={showInstallDates}
                onCheckedChange={(checked) => setShowInstallDates(checked === true)}
              />
              <label htmlFor="install_dates" className="text-sm cursor-pointer">
                Install Dates
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="follow_ups"
                checked={showFollowUps}
                onCheckedChange={(checked) => setShowFollowUps(checked === true)}
              />
              <label htmlFor="follow_ups" className="text-sm cursor-pointer">
                Follow-Ups
              </label>
            </div>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignees</SelectItem>
                <SelectItem value="me">Me</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Calendar View */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading calendar...</div>
        </div>
      ) : (
        <div>
          {view === "month" && renderMonthView()}
          {view === "week" && renderWeekView()}
          {view === "day" && renderDayView()}
        </div>
      )}

      {/* Event Details Popover */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {selectedEvent.type === "inspection" || selectedEvent.type === "inspection_event" ? (
                    <Home className="h-5 w-5 text-blue-600" />
                  ) : selectedEvent.type === "adjuster_appt" ? (
                    <User className="h-5 w-5 text-purple-600" />
                  ) : selectedEvent.type === "install_date" ? (
                    <Wrench className="h-5 w-5 text-green-600" />
                  ) : selectedEvent.type === "follow_up" ? (
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                  ) : selectedEvent.autoType ? (
                    <Phone className="h-5 w-5 text-orange-600" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-yellow-600" />
                  )}
                  <h3 className="text-lg font-semibold">{selectedEvent.title}</h3>
                  {selectedEvent.autoScheduled && (
                    <div className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                      <Sparkles className="h-3 w-3" />
                      <span>Auto-Scheduled</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="h-4 w-4" />
                  {format(parseISO(selectedEvent.start), "h:mm a")}
                  {selectedEvent.end && ` - ${format(parseISO(selectedEvent.end), "h:mm a")}`}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>
                ×
              </Button>
            </div>

            {selectedEvent.contactName && (
              <div className="mb-2">
                <div className="text-sm text-gray-500">Contact</div>
                <div className="font-medium">{selectedEvent.contactName}</div>
              </div>
            )}

            {selectedEvent.assignedTo && (
              <div className="mb-2">
                <div className="text-sm text-gray-500">Assigned To</div>
                <div className="font-medium">{selectedEvent.assignedTo.name}</div>
              </div>
            )}

            {selectedEvent.description && (
              <div className="mb-2">
                <div className="text-sm text-gray-500">Description</div>
                <div>{selectedEvent.description}</div>
              </div>
            )}

            {selectedEvent.notes && (
              <div className="mb-2">
                <div className="text-sm text-gray-500">Notes</div>
                <div>{selectedEvent.notes}</div>
              </div>
            )}

            {selectedEvent.claimNumber && (
              <div className="mb-2">
                <div className="text-sm text-gray-500">Claim Number</div>
                <div className="font-medium">{selectedEvent.claimNumber}</div>
              </div>
            )}

            {selectedEvent.carrier && (
              <div className="mb-2">
                <div className="text-sm text-gray-500">Carrier</div>
                <div className="font-medium">{selectedEvent.carrier}</div>
              </div>
            )}

            {selectedEvent.jobValue && (
              <div className="mb-2">
                <div className="text-sm text-gray-500">Job Value</div>
                <div className="font-medium">${selectedEvent.jobValue.toLocaleString()}</div>
              </div>
            )}

            {/* Block 21320: Auto-Scheduling Information */}
            {selectedEvent.autoScheduled && (
              <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <div className="text-sm font-semibold text-purple-900">Auto-Scheduled by SmartSend</div>
                </div>
                {selectedEvent.autoScheduleReason && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-600 mb-1">AI Reason:</div>
                    <div className="text-sm text-gray-800">{selectedEvent.autoScheduleReason}</div>
                  </div>
                )}
                {selectedEvent.timingReason && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-600 mb-1">Timing:</div>
                    <div className="text-sm text-gray-800">{selectedEvent.timingReason}</div>
                  </div>
                )}
                {selectedEvent.assignedToRole && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-600 mb-1">Assigned Role:</div>
                    <div className="text-sm font-medium text-gray-800">{selectedEvent.assignedToRole.replace('_', ' ')}</div>
                  </div>
                )}
                {selectedEvent.conflictDetected && (
                  <div className="flex items-center gap-1 text-xs text-orange-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>Conflict detected - time adjusted</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              {selectedEvent.contactId && (
                <Link href={`/contacts/${selectedEvent.contactId}`}>
                  <Button variant="outline" size="sm">
                    Open Contact
                  </Button>
                </Link>
              )}
              {selectedEvent.taskId && (
                <Link href={`/tasks?taskId=${selectedEvent.taskId}`}>
                  <Button variant="outline" size="sm">
                    Open Task
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

