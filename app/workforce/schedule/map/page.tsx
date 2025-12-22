"use client";

// Block 251900 — Crew Assignment Engine
// Daily Workload Map: Visual map of jobs with crew assignments

import { useState, useEffect, useMemo } from "react";
import { format, addDays, startOfWeek, isSameDay, parseISO } from "date-fns";
import useSWR from "swr";
import Link from "next/link";
import { Calendar, MapPin, Users, ArrowLeft, CheckCircle, AlertTriangle } from "lucide-react";

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

export default function DailyWorkloadMapPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const dateStr = format(parseISO(selectedDate), "yyyy-MM-dd");
  const weekStart = startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const { data, error, mutate } = useSWR(
    `/api/workforce/schedule/board?start_date=${format(weekStart, "yyyy-MM-dd")}&end_date=${format(weekEnd, "yyyy-MM-dd")}`,
    fetcher
  );

  const jobsToday = useMemo(() => {
    if (!data?.jobs) return [];
    return data.jobs.filter((job: Job) => job.production_date === dateStr);
  }, [data, dateStr]);

  const assignmentsToday = useMemo(() => {
    if (!data?.assignments) return [];
    return data.assignments.filter((a: Assignment) => a.assigned_date === dateStr);
  }, [data, dateStr]);

  const getAssignmentsForJob = (jobId: string): Assignment[] => {
    return assignmentsToday.filter((a) => a.job_id === jobId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "needs_crew":
        return "bg-red-500";
      case "fully_staffed":
        return "bg-green-500";
      case "overstaffed":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "needs_crew":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "fully_staffed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <Users className="h-4 w-4 text-gray-600" />;
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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/workforce/schedule"
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Calendar
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Daily Workload Map</h1>
              <p className="text-sm text-gray-600 mt-1">
                See all jobs and crew assignments for {format(parseISO(selectedDate), "EEEE, MMMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Map/List View */}
        <div className="flex-1 overflow-auto p-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600">Total Jobs</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{jobsToday.length}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600">Fully Staffed</div>
              <div className="text-2xl font-bold text-green-600 mt-1">
                {jobsToday.filter((j: Job) => j.staffing_status === "fully_staffed").length}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600">Needs Crew</div>
              <div className="text-2xl font-bold text-red-600 mt-1">
                {jobsToday.filter((j: Job) => j.staffing_status === "needs_crew").length}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600">Crew Assigned</div>
              <div className="text-2xl font-bold text-blue-600 mt-1">{assignmentsToday.length}</div>
            </div>
          </div>

          {/* Jobs List/Map */}
          {jobsToday.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900">No jobs scheduled for this date</p>
              <p className="text-sm text-gray-500 mt-2">Select a different date or schedule jobs first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {jobsToday.map((job: Job) => {
                const assignments = getAssignmentsForJob(job.id);
                const foreman = assignments.find((a) => a.role_on_job === "foreman");

                return (
                  <div
                    key={job.id}
                    className={`bg-white rounded-lg border-2 p-5 hover:shadow-lg transition-shadow ${
                      selectedJob === job.id
                        ? "border-blue-500 ring-2 ring-blue-200"
                        : "border-gray-200"
                    }`}
                    onClick={() => setSelectedJob(job.id === selectedJob ? null : job.id)}
                  >
                    {/* Job Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(job.staffing_status)}`} />
                          <h3 className="font-semibold text-lg text-gray-900 truncate">
                            {job.customer_name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span className="truncate">{job.address || "No address provided"}</span>
                        </div>
                      </div>
                      {getStatusIcon(job.staffing_status)}
                    </div>

                    {/* Job Type */}
                    {job.job_type && (
                      <div className="mb-3">
                        <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {job.job_type}
                        </span>
                      </div>
                    )}

                    {/* Crew Info */}
                    <div className="space-y-2">
                      {foreman && (
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                          <div className="text-xs font-medium text-blue-900 mb-1">Foreman</div>
                          <div className="text-sm text-blue-700">
                            {foreman.employee.first_name} {foreman.employee.last_name}
                          </div>
                        </div>
                      )}

                      <div className="p-2 bg-gray-50 border border-gray-200 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-medium text-gray-900">Crew Members</div>
                          <div className="text-xs text-gray-600">
                            {assignments.length}/{job.required_positions} assigned
                          </div>
                        </div>
                        {assignments.length > 0 ? (
                          <div className="space-y-1">
                            {assignments.map((assignment) => (
                              <div
                                key={assignment.id}
                                className="flex items-center justify-between text-sm py-1"
                              >
                                <span className="text-gray-700">
                                  {assignment.employee.first_name} {assignment.employee.last_name}
                                </span>
                                {assignment.role_on_job && (
                                  <span className="text-xs text-gray-500 capitalize">
                                    {assignment.role_on_job}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 text-center py-2">
                            No crew assigned yet
                          </div>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>Staffing Progress</span>
                          <span>
                            {Math.round((assignments.length / Math.max(job.required_positions, 1)) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              job.staffing_status === "fully_staffed"
                                ? "bg-green-500"
                                : job.staffing_status === "needs_crew"
                                ? "bg-red-500"
                                : "bg-orange-500"
                            }`}
                            style={{
                              width: `${Math.min(
                                (assignments.length / Math.max(job.required_positions, 1)) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar - Job Details */}
        {selectedJob && (
          <div className="w-96 border-l border-gray-200 bg-white overflow-y-auto">
            <div className="p-4 border-b border-gray-200 sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-gray-900">Job Details</h2>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-4">
              {(() => {
                const job = jobsToday.find((j: Job) => j.id === selectedJob);
                if (!job) return null;

                const assignments = getAssignmentsForJob(job.id);

                return (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">{job.customer_name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{job.address}</p>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Staffing Status</div>
                      {getStatusIcon(job.staffing_status)}
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Assigned Crew</div>
                      <div className="space-y-2">
                        {assignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="p-2 bg-gray-50 rounded border border-gray-200"
                          >
                            <div className="font-medium text-sm text-gray-900">
                              {assignment.employee.first_name} {assignment.employee.last_name}
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              Role: {assignment.role_on_job || assignment.employee.role}
                            </div>
                          </div>
                        ))}
                        {assignments.length === 0 && (
                          <div className="text-xs text-gray-400 text-center py-4">
                            No crew assigned
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <Link
                        href={`/workforce/schedule?date=${dateStr}&job=${job.id}`}
                        className="block w-full px-4 py-2 text-center text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                      >
                        Manage Assignments
                      </Link>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
























