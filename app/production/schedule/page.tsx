"use client";

// Block 26880 — SmartSend Roofing Job Capacity & Crew Scheduling Brain v1
// (Predict crew availability • Auto-schedule jobs • Avoid overbooking • Production load forecasting)
//
// This block makes SmartSend the production brain, not just sales + money.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

type DailyCapacityRow = {
  crew_id: string;
  crew_name: string;
  work_date: string;
  capacity_squares: number;
  scheduled_squares: number;
  remaining_squares: number;
};

type GlobalCapacityDay = {
  work_date: string;
  total_capacity_squares: number;
  total_scheduled_squares: number;
  total_remaining_squares: number;
  active_crews_count: number;
};

export default function ProductionSchedulePage() {
  const [rows, setRows] = useState<DailyCapacityRow[]>([]);
  const [globalDays, setGlobalDays] = useState<GlobalCapacityDay[]>([]);
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
        // Fallback: try to get from URL or localStorage
        const wsId = localStorage.getItem("workspace_id");
        if (wsId) setWorkspaceId(wsId);
      });
  }, []);

  // Fetch capacity data
  useEffect(() => {
    if (!workspaceId) return;

    setLoading(true);
    fetch(`/api/daily-capacity?workspace_id=${workspaceId}&days_ahead=14&global_days_ahead=30`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.byCrew || []);
        setGlobalDays(d.global || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching capacity:", err);
        setLoading(false);
      });
  }, [workspaceId]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Production Capacity & Crew Schedule</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track crew availability and avoid overbooking
        </p>
      </div>

      {/* Global Capacity Strip */}
      <GlobalCapacityStrip days={globalDays} loading={loading} />

      {/* Crew by Day Table */}
      <CrewCapacityTable rows={rows} loading={loading} />
    </div>
  );
}

function GlobalCapacityStrip({
  days,
  loading,
}: {
  days: GlobalCapacityDay[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Next 30 Days – Global Capacity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!days?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Next 30 Days – Global Capacity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">No capacity data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next 30 Days – Global Capacity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {days.map((d) => {
            const used =
              d.total_capacity_squares > 0
                ? 1 - d.total_remaining_squares / d.total_capacity_squares
                : 0;
            let bg = "bg-green-200";
            let textColor = "text-green-800";
            if (used > 0.85) {
              bg = "bg-red-300";
              textColor = "text-red-900";
            } else if (used > 0.6) {
              bg = "bg-yellow-200";
              textColor = "text-yellow-800";
            }

            return (
              <div
                key={d.work_date}
                className="flex flex-col items-center text-xs min-w-[60px]"
              >
                <div className="text-gray-600 mb-1">
                  {format(new Date(d.work_date), "MMM d")}
                </div>
                <div
                  className={`w-12 h-12 rounded-full ${bg} ${textColor} flex items-center justify-center font-semibold border-2 border-white shadow-sm`}
                  title={`${Math.round(used * 100)}% capacity used`}
                >
                  {Math.round(used * 100)}%
                </div>
                <div className="text-xs text-gray-500 mt-1 text-center">
                  {d.total_remaining_squares.toFixed(0)} sq
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-200"></div>
            <span>Under capacity</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-200"></div>
            <span>At capacity</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-300"></div>
            <span>Over capacity</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CrewCapacityTable({
  rows,
  loading,
}: {
  rows: DailyCapacityRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Crew Capacity (Next 14 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!rows?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Crew Capacity (Next 14 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">No crew capacity data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crew Capacity (Next 14 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b">
                <th align="left" className="p-2">Crew</th>
                <th align="left" className="p-2">Date</th>
                <th align="right" className="p-2">Capacity</th>
                <th align="right" className="p-2">Scheduled</th>
                <th align="right" className="p-2">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.crew_id}-${r.work_date}`}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="p-2 font-medium">{r.crew_name}</td>
                  <td className="p-2 text-gray-600">
                    {format(new Date(r.work_date), "MMM d, yyyy")}
                  </td>
                  <td align="right" className="p-2">
                    {r.capacity_squares}
                  </td>
                  <td align="right" className="p-2">
                    {r.scheduled_squares}
                  </td>
                  <td
                    align="right"
                    className={`p-2 font-semibold ${
                      r.remaining_squares <= 0
                        ? "text-red-600"
                        : r.remaining_squares < r.capacity_squares * 0.3
                        ? "text-yellow-600"
                        : "text-green-600"
                    }`}
                  >
                    {r.remaining_squares.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}



































