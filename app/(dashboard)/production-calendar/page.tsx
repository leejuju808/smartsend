"use client";

// Block 90000 — SmartSend Roofing "Production Calendar + Crew Scheduling Board" v1
// THE BRAIN OF ROOFING PRODUCTION
//
// This is where SmartSend becomes the single source of truth for roofing operations.
// Every job, crew, delivery, inspection, and weather event lives in one clean calendar.

import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  GripVertical,
  Truck,
  Wrench,
  Cloud,
  Users,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  getHours,
  setHours,
  setMinutes,
} from "date-fns";

type CalendarEvent = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  crew_id: string | null;
  event_type: "inspection" | "install" | "repair" | "delivery" | "meeting" | "weather_delay";
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  status: "scheduled" | "in_progress" | "completed" | "delayed" | "cancelled";
  job_title?: string;
  job_address?: string;
  crew_name?: string;
  weather_status?: string;
  weather_severity?: number;
};

type ViewType = "day" | "week" | "month";

type DraggedItem = {
  eventId?: string;
  jobId?: string;
  crewId?: string;
  type: "event" | "job" | "crew" | "delivery";
};

function getEventColor(eventType: string): string {
  switch (eventType) {
    case "install":
      return "bg-red-100 border-red-300 text-red-800";
    case "repair":
      return "bg-orange-100 border-orange-300 text-orange-800";
    case "inspection":
      return "bg-blue-100 border-blue-300 text-blue-800";
    case "delivery":
      return "bg-green-100 border-green-300 text-green-800";
    case "weather_delay":
      return "bg-gray-100 border-gray-300 text-gray-800";
    default:
      return "bg-gray-100 border-gray-300 text-gray-800";
  }
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case "install":
      return <Wrench className="h-3 w-3" />;
    case "repair":
      return <Wrench className="h-3 w-3" />;
    case "inspection":
      return <CheckCircle2 className="h-3 w-3" />;
    case "delivery":
      return <Truck className="h-3 w-3" />;
    case "weather_delay":
      return <Cloud className="h-3 w-3" />;
    default:
      return null;
  }
}

export default function ProductionCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("week");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);

  // Get workspace ID
  useEffect(() => {
    fetch("/api/workspace/current")
      .then((r) => r.json())
      .then((data) => {
        if (data.workspace?.id) {
          setWorkspaceId(data.workspace.id);
        }
      })
      .catch(() => {
        const wsId = localStorage.getItem("workspace_id");
        if (wsId) setWorkspaceId(wsId);
      });
  }, []);

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    if (view === "month") {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      return {
        start: format(start, "yyyy-MM-dd"),
        end: format(end, "yyyy-MM-dd"),
      };
    } else if (view === "week") {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return {
        start: format(start, "yyyy-MM-dd"),
        end: format(end, "yyyy-MM-dd"),
      };
    } else {
      // day view
      return {
        start: format(currentDate, "yyyy-MM-dd"),
        end: format(currentDate, "yyyy-MM-dd"),
      };
    }
  }, [currentDate, view]);

  // Fetch events
  useEffect(() => {
    if (!workspaceId) return;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/production-calendar/events?from=${dateRange.start}&to=${dateRange.end}&workspace_id=${workspaceId}`
        );
        if (!res.ok) throw new Error("Failed to fetch events");
        const data = await res.json();
        setEvents(data.events || []);
      } catch (error) {
        console.error("Error fetching events:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [workspaceId, dateRange]);

  // Fetch conflicts
  useEffect(() => {
    if (!workspaceId) return;

    const fetchConflicts = async () => {
      try {
        const res = await fetch(
          `/api/production-calendar/conflicts?workspace_id=${workspaceId}&from=${dateRange.start}&to=${dateRange.end}`
        );
        if (res.ok) {
          const data = await res.json();
          setConflicts(data.conflicts || []);
        }
      } catch (error) {
        console.error("Error fetching conflicts:", error);
      }
    };

    fetchConflicts();
  }, [workspaceId, dateRange]);

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, item: DraggedItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", JSON.stringify(item));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Date, targetTime?: string) => {
    e.preventDefault();
    if (!draggedItem || !workspaceId) return;

    try {
      const dropTime = targetTime
        ? parseISO(`${format(targetDate, "yyyy-MM-dd")}T${targetTime}`)
        : setHours(setMinutes(targetDate, 0), 8);

      if (draggedItem.type === "event" && draggedItem.eventId) {
        // Reschedule existing event
        const res = await fetch(`/api/production-calendar/events/${draggedItem.eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_time: dropTime.toISOString(),
            end_time: dropTime.toISOString(),
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          if (error.conflicts) {
            alert(`Conflict detected: ${error.conflicts[0].message}`);
          }
          throw new Error("Failed to reschedule event");
        }

        // Refresh events
        const refreshRes = await fetch(
          `/api/production-calendar/events?from=${dateRange.start}&to=${dateRange.end}&workspace_id=${workspaceId}`
        );
        const refreshData = await refreshRes.json();
        setEvents(refreshData.events || []);
      } else if (draggedItem.type === "job" && draggedItem.jobId) {
        // Create new install event for job
        const res = await fetch("/api/production-calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            job_id: draggedItem.jobId,
            event_type: "install",
            title: "Installation",
            start_time: dropTime.toISOString(),
            end_time: dropTime.toISOString(),
            crew_id: draggedItem.crewId || null,
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          if (error.conflicts) {
            alert(`Conflict detected: ${error.conflicts[0].message}`);
          }
          throw new Error("Failed to schedule job");
        }

        // Refresh events
        const refreshRes = await fetch(
          `/api/production-calendar/events?from=${dateRange.start}&to=${dateRange.end}&workspace_id=${workspaceId}`
        );
        const refreshData = await refreshRes.json();
        setEvents(refreshData.events || []);
      }
    } catch (error) {
      console.error("Error handling drop:", error);
    } finally {
      setDraggedItem(null);
    }
  };

  // Get events for a specific date
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return events.filter((e) => {
      const eventDate = format(parseISO(e.start_time), "yyyy-MM-dd");
      return eventDate === dateStr;
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

    return (
      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
          <div key={dayName} className="text-center text-sm font-semibold text-gray-600 p-2">
            {dayName}
          </div>
        ))}
        {days.map((day) => {
          const dayEvents = getEventsForDate(day);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, currentDate);

          return (
            <div
              key={day.toISOString()}
              className={`border rounded-lg p-2 min-h-[120px] ${
                !isCurrentMonth ? "opacity-40" : ""
              } ${isToday ? "ring-2 ring-blue-500" : ""}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day)}
            >
              <div className={`text-xs font-semibold mb-1 ${isToday ? "text-blue-600" : ""}`}>
                {format(day, "d")}
              </div>
              <div className="flex flex-col gap-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    draggable
                    onDragStart={(e) =>
                      handleDragStart(e, { eventId: event.id, type: "event" })
                    }
                    className={`text-[10px] rounded px-2 py-1 cursor-move ${getEventColor(
                      event.event_type
                    )} flex items-center gap-1`}
                    onClick={() => {
                      setSelectedEvent(event);
                      setDialogOpen(true);
                    }}
                  >
                    <GripVertical className="h-2 w-2 opacity-50" />
                    {getEventIcon(event.event_type)}
                    <span className="truncate">{event.title}</span>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-gray-500">
                    +{dayEvents.length - 3} more
                  </div>
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
    const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM

    return (
      <div className="flex gap-2">
        {weekDays.map((day) => {
          const dayEvents = getEventsForDate(day);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className="flex-1 border rounded-lg p-2"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day)}
            >
              <div
                className={`text-center font-semibold mb-2 ${
                  isToday ? "text-blue-600" : ""
                }`}
              >
                <div className="text-xs text-gray-500">{format(day, "EEE")}</div>
                <div className="text-lg">{format(day, "d")}</div>
              </div>
              <div className="space-y-1">
                {dayEvents.map((event) => {
                  const startHour = getHours(parseISO(event.start_time));
                  return (
                    <div
                      key={event.id}
                      draggable
                      onDragStart={(e) =>
                        handleDragStart(e, { eventId: event.id, type: "event" })
                      }
                      className={`text-xs rounded px-2 py-1 cursor-move ${getEventColor(
                        event.event_type
                      )} flex items-center gap-1`}
                      onClick={() => {
                        setSelectedEvent(event);
                        setDialogOpen(true);
                      }}
                    >
                      <GripVertical className="h-2 w-2 opacity-50" />
                      {getEventIcon(event.event_type)}
                      <span className="truncate">
                        {format(parseISO(event.start_time), "h:mm a")} - {event.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render day view
  const renderDayView = () => {
    const dayEvents = getEventsForDate(currentDate);
    const hours = Array.from({ length: 12 }, (_, i) => i + 8);

    return (
      <div className="space-y-4">
        <div className="text-lg font-semibold mb-4">
          {format(currentDate, "EEEE, MMMM d, yyyy")}
        </div>
        <div className="space-y-2">
          {dayEvents.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No events scheduled</div>
          ) : (
            dayEvents.map((event) => (
              <Card
                key={event.id}
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                draggable
                onDragStart={(e) =>
                  handleDragStart(e, { eventId: event.id, type: "event" })
                }
                onClick={() => {
                  setSelectedEvent(event);
                  setDialogOpen(true);
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getEventIcon(event.event_type)}
                      <span className="font-semibold">{event.title}</span>
                      <Badge variant="outline" className={getEventColor(event.event_type)}>
                        {event.event_type}
                      </Badge>
                    </div>
                    {event.job_title && (
                      <div className="text-sm text-gray-600 mb-1">
                        Job: {event.job_title}
                      </div>
                    )}
                    {event.job_address && (
                      <div className="text-xs text-gray-500 mb-1">{event.job_address}</div>
                    )}
                    {event.crew_name && (
                      <div className="text-sm text-gray-600">
                        Crew: {event.crew_name}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      {format(parseISO(event.start_time), "h:mm a")}
                      {event.end_time &&
                        ` - ${format(parseISO(event.end_time), "h:mm a")}`}
                    </div>
                  </div>
                  <GripVertical className="h-4 w-4 text-gray-400" />
                </div>
                {event.weather_severity && event.weather_severity > 50 && (
                  <div className="mt-2 flex items-center gap-1 text-orange-600 text-xs">
                    <Cloud className="h-3 w-3" />
                    Weather risk: {event.weather_severity}%
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Production Calendar</h1>
          <p className="text-gray-600 mt-1">
            The brain of roofing production — schedule jobs, crews, and deliveries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={view} onValueChange={(v) => setView(v as ViewType)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (view === "day") {
                setCurrentDate(addDays(currentDate, -1));
              } else if (view === "week") {
                setCurrentDate(addWeeks(currentDate, -1));
              } else {
                setCurrentDate(addMonths(currentDate, -1));
              }
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (view === "day") {
                setCurrentDate(addDays(currentDate, 1));
              } else if (view === "week") {
                setCurrentDate(addWeeks(currentDate, 1));
              } else {
                setCurrentDate(addMonths(currentDate, 1));
              }
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Conflicts Alert */}
      {conflicts.length > 0 && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">
              {conflicts.length} scheduling conflict{conflicts.length > 1 ? "s" : ""} detected
            </span>
          </div>
          <div className="mt-2 text-sm text-red-700">
            {conflicts.slice(0, 3).map((c, i) => (
              <div key={i}>• {c.message}</div>
            ))}
          </div>
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-100 border border-red-300 rounded" />
          <span>Install</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded" />
          <span>Repair</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded" />
          <span>Inspection</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-100 border border-green-300 rounded" />
          <span>Delivery</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded" />
          <span>Weather Delay</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-gray-500">Loading calendar...</div>
          </div>
        ) : (
          <>
            {view === "month" && renderMonthView()}
            {view === "week" && renderWeekView()}
            {view === "day" && renderDayView()}
          </>
        )}
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title}</DialogTitle>
            <DialogDescription>
              {selectedEvent?.description || "Event details"}
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold">Type</div>
                <div className="text-sm text-gray-600">{selectedEvent.event_type}</div>
              </div>
              {selectedEvent.job_title && (
                <div>
                  <div className="text-sm font-semibold">Job</div>
                  <div className="text-sm text-gray-600">{selectedEvent.job_title}</div>
                </div>
              )}
              {selectedEvent.crew_name && (
                <div>
                  <div className="text-sm font-semibold">Crew</div>
                  <div className="text-sm text-gray-600">{selectedEvent.crew_name}</div>
                </div>
              )}
              <div>
                <div className="text-sm font-semibold">Time</div>
                <div className="text-sm text-gray-600">
                  {format(parseISO(selectedEvent.start_time), "PPpp")}
                </div>
              </div>
              {selectedEvent.weather_severity && selectedEvent.weather_severity > 50 && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded">
                  <div className="text-sm font-semibold text-orange-800">Weather Alert</div>
                  <div className="text-sm text-orange-700">
                    Risk level: {selectedEvent.weather_severity}%
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}



























