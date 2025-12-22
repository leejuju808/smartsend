"use client";

// Block 22670 — SmartSend Roofing Production Calendar v1
// "Schedule, Crews, Materials Sync"
//
// The calendar that actually knows if a job is READY or going to be a disaster.
// This is where SmartSend steps out of just "numbers" and into daily operations.

import { useState, useEffect, useMemo } from "react";
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
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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
} from "date-fns";

type ProductionSlot = {
  slot: {
    id: string;
    job_id: string;
    crew_id: string | null;
    start_date: string;
    end_date: string;
    status: string;
  };
  job: {
    id: string;
    name: string;
    address: string | null;
    projected_value: number | null;
  } | null;
  crew: {
    id: string;
    name: string;
    foreman_name: string | null;
  } | null;
  readiness: "ready" | "cutting_it_close" | "material_delayed" | "blocked_no_materials";
  flags: string[];
};

type ViewType = "week" | "month";

function badgeColor(readiness: string): string {
  switch (readiness) {
    case "ready":
      return "text-green-600";
    case "cutting_it_close":
      return "text-yellow-600";
    case "material_delayed":
      return "text-orange-600";
    case "blocked_no_materials":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
}

function badgeBgColor(readiness: string): string {
  switch (readiness) {
    case "ready":
      return "bg-green-100 border-green-300";
    case "cutting_it_close":
      return "bg-yellow-100 border-yellow-300";
    case "material_delayed":
      return "bg-orange-100 border-orange-300";
    case "blocked_no_materials":
      return "bg-red-100 border-red-300";
    default:
      return "bg-gray-100 border-gray-300";
  }
}

function readinessIcon(readiness: string) {
  switch (readiness) {
    case "ready":
      return <CheckCircle2 className="h-3 w-3 text-green-600" />;
    case "cutting_it_close":
      return <Clock className="h-3 w-3 text-yellow-600" />;
    case "material_delayed":
      return <AlertCircle className="h-3 w-3 text-orange-600" />;
    case "blocked_no_materials":
      return <XCircle className="h-3 w-3 text-red-600" />;
    default:
      return null;
  }
}

export default function ProductionCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("week");
  const [slots, setSlots] = useState<ProductionSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

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
        // Fallback: try to get from URL or localStorage
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
    } else {
      // week view
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return {
        start: format(start, "yyyy-MM-dd"),
        end: format(end, "yyyy-MM-dd"),
      };
    }
  }, [currentDate, view]);

  // Fetch production slots
  useEffect(() => {
    if (!workspaceId) return;

    const fetchSlots = async () => {
      setLoading(true);
      // Get user's auth token
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setLoading(false);
        return;
      }

      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/production-calendar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        start_date: dateRange.start,
        end_date: dateRange.end,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.slots) {
          setSlots(data.slots);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching production calendar:", err);
        setLoading(false);
      });
    };
    
    fetchSlots();
  }, [workspaceId, dateRange]);

  // Get slots for a specific date
  const getSlotsForDate = (date: Date): ProductionSlot[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return slots.filter((s) => {
      const start = parseISO(s.slot.start_date);
      const end = parseISO(s.slot.end_date);
      const check = startOfDay(date);
      return check >= startOfDay(start) && check <= startOfDay(end);
    });
  };

  // Render day cell
  const DayCell = ({ date, slots }: { date: Date; slots: ProductionSlot[] }) => {
    const isToday = isSameDay(date, new Date());
    const isCurrentMonth = isSameMonth(date, currentDate);

    return (
      <div
        className={`border rounded-xl p-2 flex flex-col gap-1 min-h-[100px] cursor-pointer hover:bg-gray-50 transition-colors ${
          !isCurrentMonth ? "opacity-40" : ""
        } ${isToday ? "ring-2 ring-blue-500" : ""}`}
        onClick={() => setSelectedDate(date)}
      >
        <div className={`text-xs font-semibold ${isToday ? "text-blue-600" : ""}`}>
          {format(date, "d")}
        </div>
        <div className="flex flex-col gap-1 flex-1">
          {slots.map((s) => (
            <div
              key={s.slot.id}
              className={`text-[11px] rounded-lg px-2 py-1 flex items-center justify-between ${badgeBgColor(s.readiness)}`}
            >
              <span className="truncate flex-1">
                {s.crew?.name || "Unassigned"} – {s.job?.name || "Unknown Job"}
              </span>
              <span className={`ml-1 flex-shrink-0 ${badgeColor(s.readiness)}`}>
                {readinessIcon(s.readiness)}
              </span>
            </div>
          ))}
        </div>
        {slots.length === 0 && (
          <div className="text-[10px] text-gray-400 mt-auto">No jobs</div>
        )}
      </div>
    );
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
        {/* Day headers */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
          <div key={dayName} className="text-center text-sm font-semibold text-gray-600 p-2">
            {dayName}
          </div>
        ))}
        {/* Day cells */}
        {days.map((day) => (
          <DayCell key={day.toISOString()} date={day} slots={getSlotsForDate(day)} />
        ))}
      </div>
    );
  };

  // Render week view
  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div className="grid grid-cols-7 gap-2">
        {/* Day headers */}
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className="text-center border-b pb-2"
            onClick={() => setSelectedDate(day)}
          >
            <div className="text-xs text-gray-500">{format(day, "EEE")}</div>
            <div
              className={`text-lg font-semibold ${
                isSameDay(day, new Date()) ? "text-blue-600" : ""
              }`}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
        {/* Day cells */}
        {weekDays.map((day) => (
          <DayCell key={day.toISOString()} date={day} slots={getSlotsForDate(day)} />
        ))}
      </div>
    );
  };

  // Day detail panel
  const DayDetailPanel = ({ date, slots }: { date: Date; slots: ProductionSlot[] }) => {
    if (!date) return null;

    return (
      <Card className="border rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Day Details</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDate(null)}
          >
            ×
          </Button>
        </div>
        <div className="text-sm text-gray-600 mb-2">
          {format(date, "EEEE, MMMM d, yyyy")}
        </div>
        {slots.length === 0 ? (
          <div className="text-sm text-gray-500 py-4">No jobs scheduled for this day</div>
        ) : (
          <div className="flex flex-col gap-3">
            {slots.map((s) => (
              <div
                key={s.slot.id}
                className="border rounded-xl p-3 text-sm bg-white"
              >
                <div className="font-medium mb-1">{s.job?.name || "Unknown Job"}</div>
                {s.job?.address && (
                  <div className="text-xs text-muted-foreground mb-2">
                    {s.job.address}
                  </div>
                )}
                <div className="text-xs mb-2">
                  Crew: <span className="font-medium">{s.crew?.name || "Unassigned"}</span>
                  {s.crew?.foreman_name && (
                    <span className="text-gray-500"> ({s.crew.foreman_name})</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs">Status:</span>
                  <Badge
                    variant="outline"
                    className={`${badgeBgColor(s.readiness)} ${badgeColor(s.readiness)}`}
                  >
                    {readinessIcon(s.readiness)}
                    <span className="ml-1 capitalize">
                      {s.readiness.replace(/_/g, " ")}
                    </span>
                  </Badge>
                </div>
                {s.flags.length > 0 && (
                  <ul className="text-[11px] text-red-600 mt-2 list-disc list-inside">
                    {s.flags.map((f, i) => (
                      <li key={i}>⚠️ {f}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Production Calendar</h1>
          <p className="text-gray-600 mt-1">
            The calendar that actually knows if a job is READY or going to be a disaster
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={view} onValueChange={(v) => setView(v as ViewType)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (view === "week") {
                setCurrentDate(addWeeks(currentDate, -1));
              } else {
                setCurrentDate(addMonths(currentDate, -1));
              }
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (view === "week") {
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

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span>Ready</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-yellow-600" />
          <span>Cutting It Close</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <span>Material Delayed</span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-600" />
          <span>Blocked - No Materials</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-gray-500">Loading calendar...</div>
            </div>
          ) : (
            <Card className="p-4">
              {view === "month" && renderMonthView()}
              {view === "week" && renderWeekView()}
            </Card>
          )}
        </div>

        {/* Day Detail Panel */}
        <div className="lg:col-span-1">
          {selectedDate ? (
            <DayDetailPanel date={selectedDate} slots={getSlotsForDate(selectedDate)} />
          ) : (
            <Card className="p-4 border rounded-2xl">
              <div className="text-sm text-gray-500">
                Click on a day to see job details
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

