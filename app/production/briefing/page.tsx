// Block 22710 — SmartSend Roofing Production Alerts & Daily Crew Briefing v1
// Daily Crew Briefing Page
// Shows each crew's daily briefing with job readiness, materials, and risks

"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar, RefreshCw } from "lucide-react";
import { CrewBriefingSection } from "@/components/production/CrewBriefingSection";

interface JobBriefing {
  slot_id: string;
  job_id: string;
  job_name: string;
  job_address: string;
  homeowner_name: string;
  job_value: number;
  readiness: string;
  job_notes: string[];
  start_date: string;
  end_date: string;
  crew_name: string;
  foreman_name: string | null;
  foreman_phone: string | null;
}

interface BriefingData {
  briefing: Record<string, JobBriefing[]>;
}

export default function DailyBriefingPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [refreshing, setRefreshing] = useState(false);

  const loadBriefing = async (date: string) => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/production/daily-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      if (!res.ok) {
        throw new Error("Failed to load briefing");
      }

      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error("Failed to load daily briefing:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBriefing(selectedDate);
  }, [selectedDate]);

  const handleRefresh = () => {
    loadBriefing(selectedDate);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <div className="text-sm text-zinc-400">Loading daily briefing…</div>
          </div>
        </div>
      </div>
    );
  }

  const briefing = data?.briefing || {};
  const crewIds = Object.keys(briefing);

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              Daily Crew Briefing
            </h1>
            <p className="text-sm text-zinc-400">
              Every morning, SmartSend tells the crews EXACTLY what&apos;s
              happening — before chaos can happen.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm text-white border-none outline-none"
              />
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Date Display */}
        <div className="text-sm text-zinc-400">
          Briefing for:{" "}
          <span className="text-white font-medium">
            {format(new Date(selectedDate), "EEEE, MMMM d, yyyy")}
          </span>
        </div>

        {/* Crew Briefings */}
        {crewIds.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
            <p className="text-zinc-400">
              No jobs scheduled for this date.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {crewIds.map((crewId) => {
              const jobs = briefing[crewId];
              const firstJob = jobs[0];
              return (
                <CrewBriefingSection
                  key={crewId}
                  crewId={crewId}
                  crewName={firstJob.crew_name}
                  foremanName={firstJob.foreman_name}
                  foremanPhone={firstJob.foreman_phone}
                  jobs={jobs}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}







































