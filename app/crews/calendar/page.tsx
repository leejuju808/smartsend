"use client";

// Block 27820 — SmartSend Roofing Labor & Crew Scheduling Automation v1
// Crew Calendar Page: Weekly schedule view showing each crew's jobs, squares, and money

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar as CalendarIcon,
  DollarSign,
  Square,
  User,
  Phone,
  MapPin,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useWorkspaceProfile } from "@/hooks/useWorkspaceProfile";

type Crew = {
  id: string;
  name: string;
  foreman_name: string | null;
  foreman_phone: string | null;
  daily_capacity_squares: number | null;
  crew_type: string | null;
};

type ScheduledJob = {
  id: string;
  job_id: string;
  crew_id: string;
  start_date: string;
  end_date: string;
  total_squares: number;
  status: string;
  roofing_jobs: {
    id: string;
    job_name: string | null;
    title: string | null;
    homeowner_name: string | null;
    address: string | null;
    job_value: number | null;
  } | null;
};

type WeeklyMoney = {
  crew_id: string;
  week: string;
  revenue: number;
  profit: number;
  squares: number;
};

type CalendarData = {
  crews: Crew[];
  jobs: ScheduledJob[];
  weeklyMoney: WeeklyMoney[];
};

export default function CrewCalendar() {
  const { workspaceId } = useWorkspaceProfile();
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    fetch(`/api/crews/calendar?workspace_id=${workspaceId}`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP error! status: ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching calendar:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 animate-spin" />
          <span>Loading Calendar...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error loading calendar: {error}</div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6">No data available</div>;
  }

  const { crews, jobs, weeklyMoney } = data;

  // Helper to get weekly stats for a crew
  const getWeeklyStats = (crewId: string) => {
    const thisWeek = format(new Date(), "yyyy-MM-dd");
    const weekStart = format(new Date(), "yyyy-MM-dd"); // Simplified - should use week start
    return weeklyMoney.find(
      (wm) => wm.crew_id === crewId && wm.week >= weekStart
    );
  };

  // Helper to format currency
  const formatCurrency = (amount: number | null) => {
    if (!amount) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Crew Schedule</h1>
          <p className="text-gray-600">
            Weekly schedule with squares and revenue per crew
          </p>
        </div>
      </div>

      {crews.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          No crews found. Create a crew to start scheduling jobs.
        </Card>
      ) : (
        crews.map((crew) => {
          const crewJobs = jobs.filter((j) => j.crew_id === crew.id);
          const weeklyStats = getWeeklyStats(crew.id);

          return (
            <Card key={crew.id} className="p-6 bg-white shadow-sm">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <User className="h-5 w-5" />
                    {crew.name}
                  </h2>
                  {weeklyStats && (
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-green-600">
                        <DollarSign className="h-4 w-4" />
                        <span className="font-semibold">
                          {formatCurrency(weeklyStats.revenue)} this week
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-blue-600">
                        <Square className="h-4 w-4" />
                        <span className="font-semibold">
                          {weeklyStats.squares} sq
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  {crew.foreman_name && (
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{crew.foreman_name}</span>
                    </div>
                  )}
                  {crew.foreman_phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      <span>{crew.foreman_phone}</span>
                    </div>
                  )}
                  {crew.daily_capacity_squares && (
                    <div className="flex items-center gap-1">
                      <Square className="h-3 w-3" />
                      <span>{crew.daily_capacity_squares} sq/day capacity</span>
                    </div>
                  )}
                </div>
              </div>

              {crewJobs.length === 0 ? (
                <div className="text-sm text-gray-500 py-4">
                  No jobs scheduled for this crew
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 border-b">
                        <th align="left" className="pb-2">Job</th>
                        <th align="left" className="pb-2">Start</th>
                        <th align="left" className="pb-2">End</th>
                        <th align="right" className="pb-2">Squares</th>
                        <th align="right" className="pb-2">Value</th>
                        <th align="left" className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crewJobs.map((job) => {
                        const jobName =
                          job.roofing_jobs?.job_name ||
                          job.roofing_jobs?.title ||
                          "Untitled Job";
                        const homeowner =
                          job.roofing_jobs?.homeowner_name || "";
                        const address = job.roofing_jobs?.address || "";
                        const jobValue = job.roofing_jobs?.job_value || 0;

                        return (
                          <tr
                            key={job.id}
                            className="border-b last:border-0 hover:bg-gray-50"
                          >
                            <td className="py-3">
                              <div>
                                <div className="font-medium">{jobName}</div>
                                {homeowner && (
                                  <div className="text-xs text-gray-500">
                                    {homeowner}
                                  </div>
                                )}
                                {address && (
                                  <div className="text-xs text-gray-500 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {address}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-3">
                              {format(parseISO(job.start_date), "MMM d, yyyy")}
                            </td>
                            <td className="py-3">
                              {format(parseISO(job.end_date), "MMM d, yyyy")}
                            </td>
                            <td align="right" className="py-3 font-medium">
                              {job.total_squares} sq
                            </td>
                            <td align="right" className="py-3">
                              {formatCurrency(jobValue)}
                            </td>
                            <td className="py-3">
                              <Badge
                                variant={
                                  job.status === "completed"
                                    ? "default"
                                    : job.status === "in_progress"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="text-xs"
                              >
                                {job.status.toUpperCase().replace("_", " ")}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {weeklyStats && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-gray-600">Weekly Summary:</div>
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="text-gray-500">Revenue: </span>
                        <span className="font-semibold text-green-600">
                          {formatCurrency(weeklyStats.revenue)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Profit: </span>
                        <span className="font-semibold text-blue-600">
                          {formatCurrency(weeklyStats.profit)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Squares: </span>
                        <span className="font-semibold">
                          {weeklyStats.squares}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}



































