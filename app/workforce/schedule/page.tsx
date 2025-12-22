"use client";

// Block 251900 — Crew Assignment Engine
// Production Calendar: Week view with crew assignments, drag-and-drop scheduling

import { useState, useEffect, useMemo } from "react";
import { format, addDays, startOfWeek, isSameDay, parseISO, eachDayOfInterval } from "date-fns";
import useSWR from "swr";
import Link from "next/link";
import { Calendar, MapPin, Users, AlertTriangle, CheckCircle, Clock, Plus } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Job {
  id: string;
  customer_name: string;
  address: string;
  production_date: string;
  job_type: string;
  required_positions: number;
  assigned_positions: number;
  staffing_status: "needs_crew" | "fully_staffed" | "overstaffed";
}

interface Assignment {
  id: string;
  job_id: string;
  employee_id: string;
  assigned_date: string;
  role_on_job: string;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    role: string;
  };
  job: {
    id: string;
    homeowner_name: string;
    address: string;
  };
}

interface Conflict {
  employee_id: string;
  employee_name: string;
  assigned_date: string;
  jobs_count: number;
  job_ids: string[];
  conflict_type: string;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  skill_level: string;
  status: string;
}

export default function ProductionSchedulePage() {
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [showAutoAssign, setShowAutoAssign] = useState(false);

  const weekEnd = addDays(currentWeekStart, 6);
  const startDateStr = format(currentWeekStart, "yyyy-MM-dd");
  const endDateStr = format(weekEnd, "yyyy-MM-dd");

  const { data, error, mutate } = useSWR(
    `/api/workforce/schedule/board?start_date=${startDateStr}&end_date=${endDateStr}`,
    fetcher
  );

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(currentWeekStart, i);
      return {
        date,
        dateStr: format(date, "yyyy-MM-dd"),
        label: format(date, "EEE"),
        dayNum: format(date, "d"),
        isToday: isSameDay(date, new Date()),
      };
    });
  }, [currentWeekStart]);

  const getJobsForDate = (dateStr: string): Job[] => {
    if (!data?.jobs) return [];
    return data.jobs.filter((job: Job) => job.production_date === dateStr);
  };

  const getAssignmentsForDate = (dateStr: string): Assignment[] => {
    if (!data?.assignments) return [];
    return data.assignments.filter((a: Assignment) => a.assigned_date === dateStr);
  };

  const getAssignmentsForJob = (jobId: string, dateStr: string): Assignment[] => {
    return getAssignmentsForDate(dateStr).filter((a) => a.job_id === jobId);
  };

  const getConflictsForDate = (dateStr: string): Conflict[] => {
    if (!data?.conflicts) return [];
    return data.conflicts.filter((c: Conflict) => c.assigned_date === dateStr);
  };

  const handleDragStart = (e: React.DragEvent, employee: Employee) => {
    e.dataTransfer.setData("employee", JSON.stringify(employee));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, jobId: string, dateStr: string) => {
    e.preventDefault();
    const employeeData = e.dataTransfer.getData("employee");
    if (!employeeData) return;

    const employee: Employee = JSON.parse(employeeData);

    try {
      const res = await fetch("/api/workforce/schedule/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          employee_id: employee.id,
          assigned_date: dateStr,
          role_on_job: employee.role,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to assign crew");
      }

      await mutate();
    } catch (err: any) {
      console.error("Error assigning crew:", err);
      alert(err.message || "Failed to assign crew");
    }
  };

  const handleAutoAssign = async (jobId: string, dateStr: string) => {
    try {
      const res = await fetch("/api/workforce/schedule/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          assigned_date: dateStr,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to auto-assign");
      }

      await mutate();
    } catch (err: any) {
      console.error("Error auto-assigning:", err);
      alert(err.message || "Failed to auto-assign crew");
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const res = await fetch(`/api/workforce/schedule/assign?id=${assignmentId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to remove assignment");
      }

      await mutate();
    } catch (err: any) {
      console.error("Error removing assignment:", err);
      alert("Failed to remove assignment");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "needs_crew":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            <AlertTriangle className="h-3 w-3" />
            Needs Crew
          </span>
        );
      case "fully_staffed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3" />
            Fully Staffed
          </span>
        );
      case "overstaffed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
            <Users className="h-3 w-3" />
            Overstaffed
          </span>
        );
      default:
        return null;
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600">Failed to load schedule.</p>
        </div>
      </div>
    );
  }

  const conflicts = data?.conflicts || [];
  const employees = data?.employees || [];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Production Calendar</h1>
            <p className="text-sm text-gray-600 mt-1">
              Drag crew members to jobs. Auto-assign matches skills and availability.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/workforce/schedule/map"
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <MapPin className="h-4 w-4" />
              Map View
            </Link>
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              ← Previous
            </button>
            <button
              onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Conflicts Banner */}
        {conflicts.length > 0 && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900">Schedule Conflicts Detected</p>
                <p className="text-xs text-yellow-700 mt-1">
                  {conflicts.length} employee{conflicts.length !== 1 ? "s" : ""} assigned to multiple jobs:
                </p>
                <ul className="mt-2 space-y-1">
                  {conflicts.slice(0, 3).map((conflict: Conflict) => (
                    <li key={`${conflict.employee_id}-${conflict.assigned_date}`} className="text-xs text-yellow-700">
                      <strong>{conflict.employee_name}</strong> on {format(parseISO(conflict.assigned_date), "MMM d")} — {conflict.jobs_count} jobs
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Week View Calendar */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-7 gap-4">
            {weekDays.map((day) => {
              const jobsToday = getJobsForDate(day.dateStr);
              const conflictsToday = getConflictsForDate(day.dateStr);

              return (
                <div
                  key={day.dateStr}
                  className={`border rounded-lg p-3 min-h-[600px] flex flex-col ${
                    day.isToday ? "border-blue-500 border-2 bg-blue-50/20" : "bg-white"
                  }`}
                >
                  <div className="flex justify-between items-baseline mb-3 pb-2 border-b">
                    <span className="text-xs font-semibold uppercase text-gray-600">
                      {day.label}
                    </span>
                    <span
                      className={`text-lg font-bold ${
                        day.isToday ? "text-blue-600" : "text-gray-900"
                      }`}
                    >
                      {day.dayNum}
                    </span>
                  </div>

                  {/* Conflicts for this day */}
                  {conflictsToday.length > 0 && (
                    <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                      <p className="font-medium text-yellow-900">
                        {conflictsToday.length} conflict{conflictsToday.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}

                  {/* Jobs for this day */}
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {jobsToday.map((job: Job) => {
                      const assignments = getAssignmentsForJob(job.id, day.dateStr);
                      const foreman = assignments.find((a) => a.role_on_job === "foreman");
                      const crewCount = assignments.length;

                      return (
                        <div
                          key={job.id}
                          className={`border rounded-lg p-3 bg-white hover:shadow-md transition-shadow ${
                            selectedJob === job.id ? "ring-2 ring-blue-500" : ""
                          }`}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, job.id, day.dateStr)}
                        >
                          {/* Job Header */}
                          <div className="mb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm text-gray-900 truncate">
                                  {job.customer_name}
                                </h3>
                                <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                                  <MapPin className="h-3 w-3" />
                                  {job.address || "No address"}
                                </p>
                              </div>
                              {getStatusBadge(job.staffing_status)}
                            </div>
                            {job.job_type && (
                              <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                {job.job_type}
                              </span>
                            )}
                          </div>

                          {/* Foreman */}
                          {foreman ? (
                            <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                              <div className="font-medium text-blue-900">Foreman:</div>
                              <div className="text-blue-700">
                                {foreman.employee.first_name} {foreman.employee.last_name}
                              </div>
                            </div>
                          ) : (
                            <div className="mb-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500">
                              No foreman assigned
                            </div>
                          )}

                          {/* Crew List */}
                          <div className="mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-700">
                                Crew ({crewCount}/{job.required_positions})
                              </span>
                              <button
                                onClick={() => handleAutoAssign(job.id, day.dateStr)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                title="Auto-assign crew"
                              >
                                Auto
                              </button>
                            </div>
                            <div className="space-y-1">
                              {assignments.map((assignment) => (
                                <div
                                  key={assignment.id}
                                  className="flex items-center justify-between p-1.5 bg-gray-50 rounded text-xs"
                                >
                                  <span className="text-gray-900">
                                    {assignment.employee.first_name} {assignment.employee.last_name}
                                    {assignment.role_on_job && (
                                      <span className="text-gray-500 ml-1">
                                        · {assignment.role_on_job}
                                      </span>
                                    )}
                                  </span>
                                  <button
                                    onClick={() => handleRemoveAssignment(assignment.id)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              {assignments.length === 0 && (
                                <div className="text-xs text-gray-400 text-center py-2">
                                  Drop crew here
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {jobsToday.length === 0 && (
                      <div className="text-center py-8 text-xs text-gray-400">
                        No jobs scheduled
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Available Crew Sidebar */}
        <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h2 className="font-semibold text-sm text-gray-900 mb-3">Available Crew</h2>
            <p className="text-xs text-gray-500">
              Drag employees to jobs to assign them
            </p>
          </div>
          <div className="p-4 space-y-2">
            {employees.map((employee: Employee) => (
              <div
                key={employee.id}
                draggable
                onDragStart={(e) => handleDragStart(e, employee)}
                className="border rounded-lg p-3 cursor-move hover:shadow-md transition-shadow bg-white"
              >
                <div className="font-medium text-sm text-gray-900">
                  {employee.first_name} {employee.last_name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-600 capitalize">{employee.role}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-600 capitalize">{employee.skill_level}</span>
                </div>
              </div>
            ))}
            {employees.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-400">
                No active employees
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
























