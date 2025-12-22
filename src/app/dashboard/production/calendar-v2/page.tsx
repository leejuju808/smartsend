"use client";

// Block 224000 — SmartSend Roofing Production Calendar + Crew Assignment Engine v1
// Production Command Center with drag-and-drop scheduling

import { useState, useEffect, useMemo } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks, isSameDay, isSameMonth, parseISO, eachDayOfInterval, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, AlertTriangle, Users, Package, DollarSign, CheckCircle, XCircle, Clock, MapPin, Phone, Mail } from "lucide-react";

type JobSchedule = {
  id: string;
  job_id: string;
  crew_id: string | null;
  scheduled_date: string;
  status: "scheduled" | "in_progress" | "completed" | "canceled" | "delayed";
  notes?: string;
  job?: {
    id: string;
    title: string;
    job_value: number;
    estimated_squares?: number;
    official_squares?: number;
    address?: string;
    homeowner_name?: string;
    homeowner_phone?: string;
    homeowner_email?: string;
    deposit_paid?: number;
    deposit_required?: number;
    payment_status?: string;
    materials_delivered?: boolean;
    materials_confirmed?: boolean;
    material_delivery_date?: string;
  };
  crew?: {
    id: string;
    name: string;
    lead_name?: string;
    lead_phone?: string;
  };
  readiness?: {
    is_ready: boolean;
    materials_status: string;
    deposit_status: string;
  };
};

type Crew = {
  id: string;
  name: string;
  lead_name?: string;
  lead_phone?: string;
  active: boolean;
};

type ViewType = "month" | "week" | "day";

export default function ProductionCalendarV2Page() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("week");
  const [schedules, setSchedules] = useState<JobSchedule[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobSchedule | null>(null);
  const [draggedSchedule, setDraggedSchedule] = useState<JobSchedule | null>(null);

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    if (view === "month") {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
    } else if (view === "week") {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
    } else {
      const start = format(currentDate, "yyyy-MM-dd");
      return { start, end: start };
    }
  }, [currentDate, view]);

  // Fetch calendar data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [calendarRes, crewsRes] = await Promise.all([
          fetch(`/api/production/calendar?from=${dateRange.start}&to=${dateRange.end}${selectedCrew ? `&crew_id=${selectedCrew}` : ""}`),
          fetch(`/api/crews?active=true`),
        ]);

        const calendarData = await calendarRes.json();
        const crewsData = await crewsRes.json();

        setSchedules(calendarData.calendar || []);
        setCrews(crewsData.crews || crewsData || []);
      } catch (error) {
        console.error("Error fetching production calendar:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [dateRange, selectedCrew]);

  // Handle drag start
  const handleDragStart = (schedule: JobSchedule) => {
    setDraggedSchedule(schedule);
  };

  // Handle drop
  const handleDrop = async (date: Date) => {
    if (!draggedSchedule) return;

    const newDate = format(date, "yyyy-MM-dd");

    try {
      const res = await fetch("/api/production/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: draggedSchedule.id,
          new_date: newDate,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Refresh calendar
        const calendarRes = await fetch(`/api/production/calendar?from=${dateRange.start}&to=${dateRange.end}`);
        const calendarData = await calendarRes.json();
        setSchedules(calendarData.calendar || []);
        setDraggedSchedule(null);
      } else {
        alert(data.error || "Failed to move job");
      }
    } catch (error) {
      console.error("Error moving job:", error);
      alert("Failed to move job");
    }
  };

  // Get jobs for current view
  const jobsInView = useMemo(() => {
    const start = parseISO(dateRange.start);
    const end = parseISO(dateRange.end || dateRange.start);
    const days = eachDayOfInterval({ start, end });

    return days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const jobs = schedules.filter((schedule) => {
        const scheduleDate = parseISO(schedule.scheduled_date);
        return isSameDay(scheduleDate, day) && schedule.status !== "canceled";
      });
      return { date: day, dayStr, jobs };
    });
  }, [schedules, dateRange]);

  // Assign crew to job
  const handleAssignCrew = async (jobId: string, crewId: string, date: string) => {
    try {
      const res = await fetch("/api/production/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          crew_id: crewId,
          scheduled_date: date,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Refresh calendar
        const calendarRes = await fetch(`/api/production/calendar?from=${dateRange.start}&to=${dateRange.end}`);
        const calendarData = await calendarRes.json();
        setSchedules(calendarData.calendar || []);
        setSelectedJob(null);
      } else {
        alert(data.error || data.readiness_issues?.join(", ") || "Failed to assign crew");
      }
    } catch (error) {
      console.error("Error assigning crew:", error);
      alert("Failed to assign crew");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">Loading production calendar…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Drag-and-drop scheduling • Crew assignment • Material & payment validation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, -1))}
            className="p-2 border rounded hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="p-2 border rounded hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* View Toggle & Filters */}
      <div className="flex items-center justify-between bg-white border rounded-lg p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("month")}
            className={`px-3 py-1 text-sm rounded ${
              view === "month" ? "bg-blue-50 border border-blue-300 text-blue-700" : "border hover:bg-gray-50"
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setView("week")}
            className={`px-3 py-1 text-sm rounded ${
              view === "week" ? "bg-blue-50 border border-blue-300 text-blue-700" : "border hover:bg-gray-50"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView("day")}
            className={`px-3 py-1 text-sm rounded ${
              view === "day" ? "bg-blue-50 border border-blue-300 text-blue-700" : "border hover:bg-gray-50"
            }`}
          >
            Day
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedCrew || ""}
            onChange={(e) => setSelectedCrew(e.target.value || null)}
            className="text-sm border rounded px-3 py-1"
          >
            <option value="">All Crews</option>
            {crews.map((crew) => (
              <option key={crew.id} value={crew.id}>
                {crew.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <div className="lg:col-span-2 bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-4">
            {view === "month" && format(currentDate, "MMMM yyyy")}
            {view === "week" && `Week of ${format(startOfWeek(currentDate), "MMM d")}`}
            {view === "day" && format(currentDate, "EEEE, MMMM d, yyyy")}
          </h2>

          {view === "week" && (
            <div className="grid grid-cols-7 gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-xs font-semibold text-gray-600 p-2 text-center border-b">
                  {day}
                </div>
              ))}
              {jobsInView.map(({ date, dayStr, jobs }) => (
                <div
                  key={dayStr}
                  className={`min-h-32 border rounded p-2 ${
                    isToday(date) ? "bg-blue-50 border-blue-300" : "bg-white"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("bg-gray-50");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("bg-gray-50");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("bg-gray-50");
                    handleDrop(date);
                  }}
                >
                  <div className={`text-xs font-medium mb-1 ${isToday(date) ? "text-blue-700" : ""}`}>
                    {format(date, "d")}
                  </div>
                  <div className="space-y-1">
                    {jobs.map((schedule) => (
                      <div
                        key={schedule.id}
                        draggable
                        onDragStart={() => handleDragStart(schedule)}
                        onClick={() => setSelectedJob(schedule)}
                        className={`text-xs p-2 rounded cursor-move border ${
                          schedule.status === "delayed"
                            ? "border-red-300 bg-red-50 text-red-800"
                            : schedule.status === "in_progress"
                            ? "border-blue-300 bg-blue-50 text-blue-800"
                            : schedule.status === "completed"
                            ? "border-green-300 bg-green-50 text-green-800"
                            : "border-gray-300 bg-gray-50 text-gray-800"
                        }`}
                        title={schedule.job?.title || "Unknown job"}
                      >
                        <div className="font-medium truncate">{schedule.job?.title || "Unknown"}</div>
                        <div className="text-xs text-gray-600">{schedule.crew?.name || "No crew"}</div>
                        {schedule.readiness && !schedule.readiness.is_ready && (
                          <div className="text-xs text-red-600 mt-1">
                            <AlertTriangle className="h-3 w-3 inline mr-1" />
                            Not ready
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "month" && (
            <div className="grid grid-cols-7 gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-xs font-semibold text-gray-600 p-2 text-center">
                  {day}
                </div>
              ))}
              {jobsInView.map(({ date, dayStr, jobs }) => (
                <div
                  key={dayStr}
                  className={`min-h-24 border rounded p-2 ${
                    isSameMonth(date, currentDate) ? "bg-white" : "bg-gray-50"
                  }`}
                >
                  <div className="text-xs font-medium mb-1">{format(date, "d")}</div>
                  <div className="space-y-1">
                    {jobs.slice(0, 2).map((schedule) => (
                      <div
                        key={schedule.id}
                        onClick={() => setSelectedJob(schedule)}
                        className={`text-xs p-1 rounded cursor-pointer ${
                          schedule.status === "delayed"
                            ? "bg-red-100 text-red-800"
                            : schedule.status === "in_progress"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-green-100 text-green-800"
                        }`}
                        title={schedule.job?.title || "Unknown job"}
                      >
                        {schedule.crew?.name || "No crew"} - {schedule.job?.title || "Unknown"}
                      </div>
                    ))}
                    {jobs.length > 2 && (
                      <div className="text-xs text-gray-500">+{jobs.length - 2} more</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side Panel — Job Info */}
        {selectedJob && (
          <div className="bg-white border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{selectedJob.job?.title || "Job Details"}</h3>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {/* Job Info */}
            <div className="space-y-3">
              {selectedJob.job?.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div className="text-sm">{selectedJob.job.address}</div>
                </div>
              )}

              {selectedJob.job?.homeowner_name && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <div className="text-sm">{selectedJob.job.homeowner_name}</div>
                </div>
              )}

              {selectedJob.job?.homeowner_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <div className="text-sm">{selectedJob.job.homeowner_phone}</div>
                </div>
              )}

              {selectedJob.job?.job_value && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <div className="text-sm font-medium">${selectedJob.job.job_value.toLocaleString()}</div>
                </div>
              )}

              {/* Materials Status */}
              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-gray-600 mb-2">Materials</div>
                <div className="flex items-center gap-2">
                  {selectedJob.job?.materials_delivered ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : selectedJob.job?.materials_confirmed ? (
                    <Clock className="h-4 w-4 text-yellow-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <div className="text-sm">
                    {selectedJob.job?.materials_delivered
                      ? "Delivered"
                      : selectedJob.job?.materials_confirmed
                      ? "Confirmed"
                      : "Not ready"}
                  </div>
                </div>
              </div>

              {/* Payment Status */}
              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-gray-600 mb-2">Payment</div>
                <div className="flex items-center gap-2">
                  {selectedJob.readiness?.deposit_status === "paid" ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <div className="text-sm">
                    {selectedJob.readiness?.deposit_status === "paid" ? "Deposit paid" : "Deposit unpaid"}
                  </div>
                </div>
              </div>

              {/* Crew Assignment */}
              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-gray-600 mb-2">Crew</div>
                {selectedJob.crew ? (
                  <div className="text-sm">{selectedJob.crew.name}</div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-500">No crew assigned</div>
                    <select
                      onChange={(e) => {
                        if (e.target.value && selectedJob.job_id) {
                          handleAssignCrew(selectedJob.job_id, e.target.value, selectedJob.scheduled_date);
                        }
                      }}
                      className="text-sm border rounded px-2 py-1 w-full"
                    >
                      <option value="">Assign crew...</option>
                      {crews.map((crew) => (
                        <option key={crew.id} value={crew.id}>
                          {crew.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Readiness Warning */}
              {selectedJob.readiness && !selectedJob.readiness.is_ready && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <div className="text-sm font-semibold text-red-900">Job Not Ready</div>
                  </div>
                  <div className="text-xs text-red-800">
                    {selectedJob.readiness.materials_status !== "delivered" && "Materials not ready. "}
                    {selectedJob.readiness.deposit_status !== "paid" && "Deposit not paid."}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

























