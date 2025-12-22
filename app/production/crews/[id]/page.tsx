"use client";

// Block 22670 — SmartSend Roofing Production Calendar v1
// Crew View: Shows a crew's schedule for the week
//
// This makes SmartSend useful not just for the owner, but for foremen and PMs.

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  MapPin,
  Phone,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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

type Crew = {
  id: string;
  name: string;
  foreman_name: string | null;
  foreman_phone: string | null;
  notes: string | null;
};

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
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "cutting_it_close":
      return <Clock className="h-4 w-4 text-yellow-600" />;
    case "material_delayed":
      return <AlertCircle className="h-4 w-4 text-orange-600" />;
    case "blocked_no_materials":
      return <XCircle className="h-4 w-4 text-red-600" />;
    default:
      return null;
  }
}

export default function CrewViewPage() {
  const params = useParams();
  const crewId = params.id as string;
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [crew, setCrew] = useState<Crew | null>(null);
  const [slots, setSlots] = useState<ProductionSlot[]>([]);
  const [loading, setLoading] = useState(true);
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
        const wsId = localStorage.getItem("workspace_id");
        if (wsId) setWorkspaceId(wsId);
      });
  }, []);

  // Fetch crew details
  useEffect(() => {
    if (!crewId || !workspaceId) return;

    const supabase = createSupabaseBrowserClient();
    supabase
      .from("crews")
      .select("*")
      .eq("id", crewId)
      .eq("workspace_id", workspaceId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("Error fetching crew:", error);
        } else {
          setCrew(data);
        }
      });
  }, [crewId, workspaceId]);

  // Fetch crew's schedule
  useEffect(() => {
    if (!crewId || !workspaceId) return;
    
    const fetchSchedule = async () => {

    const weekStart = startOfWeek(currentWeek);
    const weekEnd = endOfWeek(currentWeek);
    const startDate = format(weekStart, "yyyy-MM-dd");
    const endDate = format(weekEnd, "yyyy-MM-dd");

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
        start_date: startDate,
        end_date: endDate,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.slots) {
          // Filter to only this crew's slots
          const crewSlots = data.slots.filter(
            (s: ProductionSlot) => s.slot.crew_id === crewId
          );
          setSlots(crewSlots);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching crew schedule:", err);
        setLoading(false);
      });
    };
    
    fetchSchedule();
  }, [crewId, workspaceId, currentWeek]);

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

  const weekStart = startOfWeek(currentWeek);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/production/calendar">
              <Button variant="ghost" size="sm">
                ← Back to Calendar
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {crew?.name || "Loading..."} Schedule
          </h1>
          <p className="text-gray-600 mt-1">
            Here's where you're going this week
          </p>
          {crew?.foreman_name && (
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span>Foreman: {crew.foreman_name}</span>
              {crew.foreman_phone && (
                <>
                  <span>•</span>
                  <Phone className="h-4 w-4" />
                  <span>{crew.foreman_phone}</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(addWeeks(currentWeek, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentWeek(new Date())}>
            This Week
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week View */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading schedule...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {weekDays.map((day) => {
            const daySlots = getSlotsForDate(day);
            const isToday = isSameDay(day, new Date());

            return (
              <Card
                key={day.toISOString()}
                className={`p-4 ${isToday ? "ring-2 ring-blue-500" : ""}`}
              >
                <div className="mb-3">
                  <div className="text-xs text-gray-500 uppercase">
                    {format(day, "EEE")}
                  </div>
                  <div
                    className={`text-lg font-semibold ${
                      isToday ? "text-blue-600" : ""
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                </div>

                {daySlots.length === 0 ? (
                  <div className="text-sm text-gray-400 py-4">No jobs scheduled</div>
                ) : (
                  <div className="space-y-3">
                    {daySlots.map((s) => (
                      <div
                        key={s.slot.id}
                        className="border rounded-lg p-3 bg-white"
                      >
                        <div className="font-medium text-sm mb-1">
                          {s.job?.name || "Unknown Job"}
                        </div>
                        {s.job?.address && (
                          <div className="flex items-start gap-1 text-xs text-gray-600 mb-2">
                            <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-2">{s.job.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant="outline"
                            className={`${badgeBgColor(s.readiness)} ${badgeColor(s.readiness)} text-xs`}
                          >
                            {readinessIcon(s.readiness)}
                            <span className="ml-1 capitalize">
                              {s.readiness.replace(/_/g, " ")}
                            </span>
                          </Badge>
                        </div>
                        {s.flags.length > 0 && (
                          <ul className="text-[10px] text-red-600 mt-1 space-y-0.5">
                            {s.flags.map((f, i) => (
                              <li key={i}>⚠️ {f}</li>
                            ))}
                          </ul>
                        )}
                        {s.job?.projected_value && (
                          <div className="text-xs text-gray-500 mt-2">
                            Value: ${s.job.projected_value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {!loading && slots.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Week Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Total Jobs</div>
              <div className="text-2xl font-bold">{slots.length}</div>
            </div>
            <div>
              <div className="text-gray-600">Ready</div>
              <div className="text-2xl font-bold text-green-600">
                {slots.filter((s) => s.readiness === "ready").length}
              </div>
            </div>
            <div>
              <div className="text-gray-600">At Risk</div>
              <div className="text-2xl font-bold text-yellow-600">
                {slots.filter(
                  (s) =>
                    s.readiness === "cutting_it_close" ||
                    s.readiness === "material_delayed"
                ).length}
              </div>
            </div>
            <div>
              <div className="text-gray-600">Blocked</div>
              <div className="text-2xl font-bold text-red-600">
                {slots.filter((s) => s.readiness === "blocked_no_materials").length}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

