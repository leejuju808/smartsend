"use client";

/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * Multi-Crew Smart Calendar with:
 * - Weather-Aware Scheduling
 * - Conflict Detection
 * - Capacity Forecasting
 * - Auto-Rescheduling
 */

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cloud,
  CloudRain,
  Wind,
  Users,
  Truck,
  Wrench,
  Zap,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
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
  getHours,
  setHours,
} from "date-fns";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

type CalendarEvent = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  crew_id: string | null;
  event_type: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  event_status: string;
  weather_risk_score: number;
  crews?: { name: string; foreman_name: string | null } | null;
  roofing_jobs?: { title: string; job_value: number; status: string } | null;
  leads?: { name: string; email: string; phone: string; address: string } | null;
};

type ScheduleConflict = {
  id: string;
  event_id: string;
  conflict_type: string;
  severity: string;
  description: string;
  resolution_suggestion?: string;
};

type CapacityForecast = {
  date: string;
  crewAvailable: number;
  crewNeeded: number;
  workloadStatus: string;
  utilizationPercentage: number;
};

type ViewType = "week" | "month";

export default function SmartCalendarPage() {
  const { workspace } = useCurrentWorkspace();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewType, setViewType] = useState<ViewType>("week");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [capacityForecasts, setCapacityForecasts] = useState<CapacityForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState("");

  // Fetch calendar data
  useEffect(() => {
    if (!workspace?.id) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const startDate = viewType === "week"
          ? startOfWeek(currentDate).toISOString()
          : startOfMonth(currentDate).toISOString();
        const endDate = viewType === "week"
          ? endOfWeek(currentDate).toISOString()
          : endOfMonth(currentDate).toISOString();

        // Fetch events
        const eventsRes = await fetch(
          `/api/scheduling/calendar?workspace_id=${workspace.id}&start_date=${startDate}&end_date=${endDate}`
        );
        const eventsData = await eventsRes.json();
        setEvents(eventsData.events || []);

        // Fetch conflicts
        const conflictsRes = await fetch(
          `/api/scheduling/conflicts?workspace_id=${workspace.id}&start_date=${startDate.split('T')[0]}&end_date=${endDate.split('T')[0]}`
        );
        const conflictsData = await conflictsRes.json();
        setConflicts([...conflictsData.detected, ...(conflictsData.stored || [])]);

        // Fetch capacity forecasts
        const capacityRes = await fetch(
          `/api/scheduling/capacity?workspace_id=${workspace.id}&start_date=${startDate.split('T')[0]}&end_date=${endDate.split('T')[0]}`
        );
        const capacityData = await capacityRes.json();
        setCapacityForecasts(capacityData.forecasts || []);
      } catch (error) {
        console.error("Error fetching calendar data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workspace?.id, currentDate, viewType]);

  const handleReschedule = async () => {
    if (!selectedEvent || !rescheduleReason) return;

    try {
      const res = await fetch("/api/scheduling/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspace?.id,
          event_id: selectedEvent.id,
          reason: rescheduleReason,
          notify_customer: true,
          update_materials: true,
        }),
      });

      if (res.ok) {
        setShowRescheduleDialog(false);
        setSelectedEvent(null);
        setRescheduleReason("");
        // Refresh data
        window.location.reload();
      }
    } catch (error) {
      console.error("Error rescheduling:", error);
    }
  };

  const getEventColor = (event: CalendarEvent) => {
    if (event.weather_risk_score > 0.7) return "bg-red-100 border-red-500 text-red-900";
    if (event.weather_risk_score > 0.4) return "bg-yellow-100 border-yellow-500 text-yellow-900";
    if (event.event_type === "install") return "bg-blue-100 border-blue-500 text-blue-900";
    if (event.event_type === "repair") return "bg-purple-100 border-purple-500 text-purple-900";
    if (event.event_type === "material_delivery") return "bg-green-100 border-green-500 text-green-900";
    return "bg-gray-100 border-gray-500 text-gray-900";
  };

  const getWeatherIcon = (riskScore: number) => {
    if (riskScore > 0.7) return <CloudRain className="w-4 h-4" />;
    if (riskScore > 0.4) return <Cloud className="w-4 h-4" />;
    return null;
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const startWeek = startOfWeek(start);
    const endWeek = endOfWeek(end);
    const days: Date[] = [];
    let current = startWeek;
    while (current <= endWeek) {
      days.push(current);
      current = addDays(current, 1);
    }
    return days;
  }, [currentDate]);

  const getEventsForDay = (date: Date) => {
    return events.filter((event) => {
      const eventDate = parseISO(event.start_time);
      return isSameDay(eventDate, date);
    });
  };

  const getConflictsForEvent = (eventId: string) => {
    return conflicts.filter((c) => c.event_id === eventId && !c.resolved);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Smart Calendar</h1>
          <p className="text-muted-foreground">
            Multi-crew scheduling with weather intelligence & conflict prevention
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={viewType} onValueChange={(v) => setViewType(v as ViewType)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(viewType === "week" ? addWeeks(currentDate, -1) : addMonths(currentDate, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(viewType === "week" ? addWeeks(currentDate, 1) : addMonths(currentDate, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Capacity Summary */}
      {capacityForecasts.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              <span className="font-semibold">Capacity Forecast (Next 14 Days)</span>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {capacityForecasts.filter((f) => f.workloadStatus === "under_capacity").length}
                </div>
                <div className="text-xs text-muted-foreground">Under Capacity</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {capacityForecasts.filter((f) => f.workloadStatus === "balanced").length}
                </div>
                <div className="text-xs text-muted-foreground">Balanced</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {capacityForecasts.filter((f) => f.workloadStatus === "overloaded").length}
                </div>
                <div className="text-xs text-muted-foreground">Overloaded</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {capacityForecasts.filter((f) => f.workloadStatus === "critical_overload").length}
                </div>
                <div className="text-xs text-muted-foreground">Critical</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Conflicts Alert */}
      {conflicts.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Schedule Conflicts Detected</AlertTitle>
          <AlertDescription>
            {conflicts.length} conflict(s) found. Review and resolve to prevent scheduling issues.
          </AlertDescription>
        </Alert>
      )}

      {/* Calendar View */}
      {loading ? (
        <div className="text-center py-12">Loading calendar...</div>
      ) : viewType === "week" ? (
        <div className="grid grid-cols-8 gap-2">
          {/* Time column */}
          <div className="col-span-1">
            <div className="h-12"></div>
            {Array.from({ length: 12 }, (_, i) => i + 8).map((hour) => (
              <div key={hour} className="h-16 border-t text-xs text-muted-foreground p-1">
                {hour}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => {
            const dayEvents = getEventsForDay(day);
            return (
              <div key={dayIdx} className="col-span-1">
                <div className="h-12 border-b font-semibold text-center p-2">
                  <div>{format(day, "EEE")}</div>
                  <div className="text-lg">{format(day, "d")}</div>
                </div>
                <div className="relative">
                  {Array.from({ length: 12 }, (_, i) => i + 8).map((hour) => {
                    const hourEvents = dayEvents.filter((event) => {
                      const eventHour = getHours(parseISO(event.start_time));
                      return eventHour === hour || (eventHour < hour && event.end_time && getHours(parseISO(event.end_time)) > hour);
                    });

                    return (
                      <div key={hour} className="h-16 border-t">
                        {hourEvents.map((event) => {
                          const eventHour = getHours(parseISO(event.start_time));
                          if (eventHour === hour) {
                            const conflicts = getConflictsForEvent(event.id);
                            return (
                              <div
                                key={event.id}
                                className={`absolute left-0 right-0 m-1 p-2 rounded border ${getEventColor(event)} cursor-pointer text-xs`}
                                style={{
                                  top: `${(hour - 8) * 64}px`,
                                  height: event.end_time
                                    ? `${((new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / (1000 * 60 * 60)) * 64}px`
                                    : "64px",
                                }}
                                onClick={() => setSelectedEvent(event)}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold truncate">{event.title}</span>
                                  {event.weather_risk_score > 0.4 && getWeatherIcon(event.weather_risk_score)}
                                </div>
                                {event.crews?.name && (
                                  <div className="text-xs opacity-75">Crew: {event.crews.name}</div>
                                )}
                                {conflicts.length > 0 && (
                                  <Badge variant="destructive" className="mt-1">
                                    {conflicts.length} conflict(s)
                                  </Badge>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {/* Month view */}
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="font-semibold text-center p-2 border-b">
              {day}
            </div>
          ))}
          {monthDays.map((day, idx) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            return (
              <div
                key={idx}
                className={`min-h-24 border p-2 ${isCurrentMonth ? "bg-white" : "bg-gray-50"} ${isSameDay(day, new Date()) ? "ring-2 ring-blue-500" : ""}`}
              >
                <div className="font-semibold mb-1">{format(day, "d")}</div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((event) => {
                    const conflicts = getConflictsForEvent(event.id);
                    return (
                      <div
                        key={event.id}
                        className={`text-xs p-1 rounded border cursor-pointer ${getEventColor(event)}`}
                        onClick={() => setSelectedEvent(event)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{event.title}</span>
                          {event.weather_risk_score > 0.4 && getWeatherIcon(event.weather_risk_score)}
                        </div>
                        {conflicts.length > 0 && (
                          <Badge variant="destructive" className="mt-1 text-xs">
                            Conflict
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Detail Dialog */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedEvent.title}</DialogTitle>
              <DialogDescription>
                {format(parseISO(selectedEvent.start_time), "EEEE, MMMM d, yyyy 'at' h:mm a")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <strong>Type:</strong> {selectedEvent.event_type}
              </div>
              {selectedEvent.crews?.name && (
                <div>
                  <strong>Crew:</strong> {selectedEvent.crews.name}
                </div>
              )}
              {selectedEvent.roofing_jobs?.title && (
                <div>
                  <strong>Job:</strong> {selectedEvent.roofing_jobs.title}
                </div>
              )}
              {selectedEvent.leads?.address && (
                <div>
                  <strong>Address:</strong> {selectedEvent.leads.address}
                </div>
              )}
              {selectedEvent.weather_risk_score > 0.4 && (
                <Alert variant={selectedEvent.weather_risk_score > 0.7 ? "destructive" : "default"}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Weather Risk</AlertTitle>
                  <AlertDescription>
                    Weather risk score: {(selectedEvent.weather_risk_score * 100).toFixed(0)}%
                    {selectedEvent.weather_risk_score > 0.7 && " - Consider rescheduling"}
                  </AlertDescription>
                </Alert>
              )}
              {getConflictsForEvent(selectedEvent.id).length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Schedule Conflicts</AlertTitle>
                  <AlertDescription>
                    {getConflictsForEvent(selectedEvent.id).map((c) => (
                      <div key={c.id} className="mt-2">
                        <strong>{c.severity.toUpperCase()}:</strong> {c.description}
                        {c.resolution_suggestion && (
                          <div className="text-sm mt-1">Suggestion: {c.resolution_suggestion}</div>
                        )}
                      </div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRescheduleDialog(true);
                }}
              >
                Reschedule
              </Button>
              <Button onClick={() => setSelectedEvent(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reschedule Dialog */}
      <Dialog open={showRescheduleDialog} onOpenChange={setShowRescheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Event</DialogTitle>
            <DialogDescription>
              Provide a reason for rescheduling. SmartSend will find the next available slot and notify the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Reason</label>
              <textarea
                className="w-full mt-1 p-2 border rounded"
                rows={3}
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="e.g., Weather risk, material delay, crew conflict..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRescheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleReschedule} disabled={!rescheduleReason}>
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}





















