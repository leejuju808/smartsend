"use client";

// Job Scheduling Drawer Component
// Contains: Crew selector, Start date picker, AI duration estimate, Weather forecast

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Calendar, Users, Clock, Cloud, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface JobSchedulingDrawerProps {
  jobId: string;
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onScheduleCreated?: () => void;
}

interface Crew {
  id: string;
  name: string;
  foreman_name?: string;
  daily_capacity_squares?: number;
}

interface DurationEstimate {
  estimated_hours: number;
  estimated_days: number;
  breakdown?: any;
  confidence: string;
  method: string;
}

interface WeatherForecast {
  risk_level: string;
  risk_reasons: string[];
  recommended_action: string;
  suggested_reschedule_date?: string;
  weather_summary: {
    condition: string;
    description: string;
    temperature: string;
    wind: string;
    precipitation: string;
  };
}

export function JobSchedulingDrawer({
  jobId,
  workspaceId,
  isOpen,
  onClose,
  onScheduleCreated,
}: JobSchedulingDrawerProps) {
  const supabase = createClientComponentClient();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [durationEstimate, setDurationEstimate] = useState<DurationEstimate | null>(null);
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculatingDuration, setCalculatingDuration] = useState(false);
  const [checkingWeather, setCheckingWeather] = useState(false);
  const [notes, setNotes] = useState("");

  // Load crews
  useEffect(() => {
    if (isOpen && workspaceId) {
      loadCrews();
    }
  }, [isOpen, workspaceId]);

  // Calculate duration when crew or date changes
  useEffect(() => {
    if (selectedCrewId && startDate && jobId) {
      calculateDuration();
    }
  }, [selectedCrewId, startDate, jobId]);

  // Check weather when date is selected
  useEffect(() => {
    if (startDate && jobId) {
      checkWeather();
    }
  }, [startDate, jobId]);

  async function loadCrews() {
    try {
      const { data, error } = await supabase
        .from("crews")
        .select("id, name, foreman_name, daily_capacity_squares")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setCrews(data || []);
    } catch (error) {
      console.error("Error loading crews:", error);
    }
  }

  async function calculateDuration() {
    if (!selectedCrewId || !startDate) return;

    setCalculatingDuration(true);
    try {
      const response = await fetch("/api/schedule/ai-duration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          crew_id: selectedCrewId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setDurationEstimate(data);
      }
    } catch (error) {
      console.error("Error calculating duration:", error);
    } finally {
      setCalculatingDuration(false);
    }
  }

  async function checkWeather() {
    if (!startDate) return;

    setCheckingWeather(true);
    try {
      const response = await fetch("/api/schedule/weather-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          date: startDate,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setWeatherForecast(data);
      }
    } catch (error) {
      console.error("Error checking weather:", error);
    } finally {
      setCheckingWeather(false);
    }
  }

  async function handleAssignCrew() {
    if (!selectedCrewId || !startDate) {
      alert("Please select a crew and start date");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/schedule/assign-crew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          job_id: jobId,
          crew_id: selectedCrewId,
          start_date: startDate,
          estimated_duration: durationEstimate?.estimated_hours,
          notes: notes || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        if (data.conflicts && data.conflicts.length > 0) {
          const conflictMsg = `Schedule created, but ${data.conflicts.length} conflict(s) detected. Please review the calendar.`;
          alert(conflictMsg);
        }
        onScheduleCreated?.();
        onClose();
      } else {
        alert(data.error || "Failed to assign crew");
      }
    } catch (error: any) {
      console.error("Error assigning crew:", error);
      alert("Failed to assign crew: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const selectedCrew = crews.find((c) => c.id === selectedCrewId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-t-lg sm:rounded-lg w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Schedule Job</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Crew Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="h-4 w-4 inline mr-2" />
              Select Crew
            </label>
            <select
              value={selectedCrewId}
              onChange={(e) => setSelectedCrewId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="">Choose a crew...</option>
              {crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.name}
                  {crew.foreman_name && ` (${crew.foreman_name})`}
                </option>
              ))}
            </select>
            {selectedCrew && selectedCrew.daily_capacity_squares && (
              <p className="text-xs text-gray-500 mt-1">
                Daily capacity: {selectedCrew.daily_capacity_squares} squares/day
              </p>
            )}
          </div>

          {/* Start Date Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="h-4 w-4 inline mr-2" />
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          {/* AI Duration Estimate */}
          {selectedCrewId && startDate && (
            <div className="border rounded-lg p-4 bg-blue-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Estimated Duration
                </h3>
                {calculatingDuration && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>
              {durationEstimate ? (
                <div>
                  <p className="text-2xl font-bold">
                    {durationEstimate.estimated_days} day
                    {durationEstimate.estimated_days !== 1 ? "s" : ""}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    ({durationEstimate.estimated_hours.toFixed(1)} hours)
                  </p>
                  {durationEstimate.breakdown && (
                    <div className="mt-3 text-xs text-gray-600 space-y-1">
                      <div>Base: {durationEstimate.breakdown.base_hours?.toFixed(1)}h</div>
                      {durationEstimate.breakdown.pitch_multiplier && (
                        <div>Pitch multiplier: {durationEstimate.breakdown.pitch_multiplier}x</div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Confidence: {durationEstimate.confidence} ({durationEstimate.method})
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Calculating...</p>
              )}
            </div>
          )}

          {/* Weather Forecast */}
          {startDate && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  Weather Forecast
                </h3>
                {checkingWeather && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>
              {weatherForecast ? (
                <div>
                  <div className={`inline-block px-2 py-1 rounded text-xs font-medium mb-2 ${
                    weatherForecast.risk_level === "critical" ? "bg-red-100 text-red-800" :
                    weatherForecast.risk_level === "high" ? "bg-orange-100 text-orange-800" :
                    weatherForecast.risk_level === "medium" ? "bg-yellow-100 text-yellow-800" :
                    "bg-green-100 text-green-800"
                  }`}>
                    {weatherForecast.risk_level.toUpperCase()} RISK
                  </div>
                  {weatherForecast.risk_reasons.length > 0 && (
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">Risks:</p>
                        <ul className="list-disc list-inside text-gray-600">
                          {weatherForecast.risk_reasons.map((reason, i) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  <div className="text-sm space-y-1">
                    <p><strong>Condition:</strong> {weatherForecast.weather_summary.condition}</p>
                    <p><strong>Temperature:</strong> {weatherForecast.weather_summary.temperature}</p>
                    <p><strong>Wind:</strong> {weatherForecast.weather_summary.wind}</p>
                    <p><strong>Precipitation:</strong> {weatherForecast.weather_summary.precipitation}</p>
                  </div>
                  {weatherForecast.recommended_action !== "proceed" && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm font-medium text-yellow-800">
                        Recommendation: {weatherForecast.recommended_action.toUpperCase()}
                      </p>
                      {weatherForecast.suggested_reschedule_date && (
                        <p className="text-xs text-yellow-700 mt-1">
                          Suggested date: {format(new Date(weatherForecast.suggested_reschedule_date), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Checking weather...</p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Add any special instructions or notes..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleAssignCrew}
              disabled={loading || !selectedCrewId || !startDate}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Assigning..." : "Assign Crew"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
































