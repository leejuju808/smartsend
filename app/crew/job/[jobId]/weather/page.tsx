"use client";

// Block 252700 — Real-Time Weather Intelligence Engine
// Crew App Weather View
// Shows hourly forecast, wind speeds, heat index, alerts
// Foremen get: green (good), yellow (caution), red (stop work) indicators

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  Cloud,
  CloudRain,
  Wind,
  Sun,
  AlertTriangle,
  CheckCircle2,
  Thermometer,
  Droplets,
  Activity,
} from "lucide-react";

interface WeatherStatus {
  job_id: string;
  forecast: {
    hourly: Array<{
      datetime: string;
      precipitation_probability: number;
      wind_speed_mph: number;
      wind_gusts_mph: number;
      temperature_f: number;
      humidity_percent: number;
      heat_index_f?: number;
      osha_alert?: {
        level: string;
        message: string;
        actions: string[];
      };
      condition: string;
    }>;
    daily: any;
  };
  risk_level: "normal" | "caution" | "high_risk";
  current_risk_score: number;
  current_heat_index_f: number;
  current_wind_speed_mph: number;
  current_rain_probability: number;
  updated_at: string;
}

interface WeatherEvent {
  id: string;
  event_type: string;
  event_title: string;
  event_message: string;
  event_severity: "low" | "medium" | "high";
  heat_index_f?: number;
  created_at: string;
}

export default function CrewJobWeatherPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.jobId as string;

  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus | null>(null);
  const [weatherEvents, setWeatherEvents] = useState<WeatherEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;

    fetchWeatherData();
    // Refresh every 15 minutes
    const interval = setInterval(fetchWeatherData, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [jobId]);

  async function fetchWeatherData() {
    try {
      setLoading(true);

      // Fetch weather status
      const statusRes = await fetch(`/api/weather/job/${jobId}/status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setWeatherStatus(statusData);
      }

      // Fetch recent weather events
      const eventsRes = await fetch(`/api/weather/job/${jobId}/events?limit=10`);
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setWeatherEvents(eventsData.events || []);
      }
    } catch (error) {
      console.error("Error fetching weather data:", error);
    } finally {
      setLoading(false);
    }
  }

  function getRiskIndicator(riskLevel: string, riskScore: number) {
    if (riskLevel === "high_risk" || riskScore >= 70) {
      return {
        color: "red",
        bg: "bg-red-50",
        border: "border-red-500",
        text: "text-red-700",
        icon: AlertTriangle,
        label: "STOP WORK",
      };
    } else if (riskLevel === "caution" || riskScore >= 40) {
      return {
        color: "yellow",
        bg: "bg-yellow-50",
        border: "border-yellow-500",
        text: "text-yellow-700",
        icon: AlertTriangle,
        label: "CAUTION",
      };
    } else {
      return {
        color: "green",
        bg: "bg-green-50",
        border: "border-green-500",
        text: "text-green-700",
        icon: CheckCircle2,
        label: "GOOD",
      };
    }
  }

  function getWorkingHours(hourly: any[]) {
    if (!hourly || hourly.length === 0) return [];
    // Filter to working hours (7 AM - 5 PM)
    return hourly.filter((h) => {
      const hour = new Date(h.datetime).getHours();
      return hour >= 7 && hour <= 17;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center py-12">
              <Activity className="h-8 w-8 animate-spin text-orange-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading weather data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!weatherStatus) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center py-12">
              <p className="text-gray-600">No weather data available for this job.</p>
              <button
                onClick={() => router.back()}
                className="mt-4 text-orange-600 hover:text-orange-700"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const riskIndicator = getRiskIndicator(
    weatherStatus.risk_level,
    weatherStatus.current_risk_score || 0
  );
  const RiskIcon = riskIndicator.icon;
  const workingHours = getWorkingHours(weatherStatus.forecast?.hourly || []);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Weather Forecast</h1>
            <button
              onClick={() => router.back()}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back
            </button>
          </div>

          {/* Current Risk Status */}
          <div
            className={`${riskIndicator.bg} ${riskIndicator.border} border-2 rounded-lg p-4 mb-4`}
          >
            <div className="flex items-center gap-3">
              <RiskIcon className={`h-8 w-8 ${riskIndicator.text}`} />
              <div>
                <h2 className={`font-bold text-lg ${riskIndicator.text}`}>
                  {riskIndicator.label}
                </h2>
                <p className={`text-sm ${riskIndicator.text}`}>
                  Risk Score: {weatherStatus.current_risk_score || 0}/100
                </p>
              </div>
            </div>
          </div>

          {/* Current Conditions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Thermometer className="h-4 w-4" />
                <span className="text-xs">Heat Index</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {weatherStatus.current_heat_index_f
                  ? `${Math.round(weatherStatus.current_heat_index_f)}°F`
                  : "N/A"}
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Wind className="h-4 w-4" />
                <span className="text-xs">Wind Speed</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {weatherStatus.current_wind_speed_mph
                  ? `${Math.round(weatherStatus.current_wind_speed_mph)} mph`
                  : "N/A"}
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <CloudRain className="h-4 w-4" />
                <span className="text-xs">Rain Chance</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {weatherStatus.current_rain_probability
                  ? `${Math.round(weatherStatus.current_rain_probability)}%`
                  : "0%"}
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Activity className="h-4 w-4" />
                <span className="text-xs">Updated</span>
              </div>
              <p className="text-sm font-medium text-gray-900">
                {weatherStatus.updated_at
                  ? format(parseISO(weatherStatus.updated_at), "MMM d, h:mm a")
                  : "Never"}
              </p>
            </div>
          </div>
        </div>

        {/* Active Alerts */}
        {weatherEvents.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Active Alerts</h2>
            <div className="space-y-3">
              {weatherEvents.map((event) => (
                <div
                  key={event.id}
                  className={`border-l-4 p-4 rounded ${
                    event.event_severity === "high"
                      ? "border-red-500 bg-red-50"
                      : event.event_severity === "medium"
                      ? "border-yellow-500 bg-yellow-50"
                      : "border-blue-500 bg-blue-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className={`h-5 w-5 mt-0.5 ${
                        event.event_severity === "high"
                          ? "text-red-600"
                          : event.event_severity === "medium"
                          ? "text-yellow-600"
                          : "text-blue-600"
                      }`}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{event.event_title}</h3>
                      <p className="text-sm text-gray-700 mt-1">{event.event_message}</p>
                      {event.heat_index_f && (
                        <p className="text-xs text-gray-600 mt-2">
                          Heat Index: {Math.round(event.heat_index_f)}°F
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hourly Forecast */}
        {workingHours.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Today's Forecast</h2>
            <div className="space-y-3">
              {workingHours.map((hour, idx) => {
                const hourDate = parseISO(hour.datetime);
                const hourNum = hourDate.getHours();
                const isHighRisk =
                  hour.precipitation_probability >= 60 ||
                  hour.wind_speed_mph >= 35 ||
                  (hour.heat_index_f && hour.heat_index_f >= 103);

                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-4 p-3 rounded-lg ${
                      isHighRisk ? "bg-red-50 border border-red-200" : "bg-gray-50"
                    }`}
                  >
                    <div className="w-20 text-sm font-medium text-gray-700">
                      {format(hourDate, "h:mm a")}
                    </div>

                    <div className="flex-1 grid grid-cols-4 gap-4">
                      <div className="flex items-center gap-2">
                        <Thermometer className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">
                          {Math.round(hour.temperature_f)}°F
                        </span>
                        {hour.heat_index_f && (
                          <span className="text-xs text-gray-500">
                            (HI: {Math.round(hour.heat_index_f)}°F)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Wind className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">
                          {Math.round(hour.wind_speed_mph)} mph
                        </span>
                        {hour.wind_gusts_mph > hour.wind_speed_mph && (
                          <span className="text-xs text-gray-500">
                            (gusts: {Math.round(hour.wind_gusts_mph)})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <CloudRain className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">
                          {Math.round(hour.precipitation_probability)}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {hour.osha_alert && hour.osha_alert.level !== "normal" && (
                          <div className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                            OSHA Alert
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* OSHA Heat Index Alerts */}
        {workingHours.some(
          (h) => h.osha_alert && h.osha_alert.level !== "normal"
        ) && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              OSHA Heat Safety Requirements
            </h2>
            <div className="space-y-4">
              {workingHours
                .filter((h) => h.osha_alert && h.osha_alert.level !== "normal")
                .map((hour, idx) => {
                  const hourDate = parseISO(hour.datetime);
                  return (
                    <div
                      key={idx}
                      className="border-l-4 border-orange-500 bg-orange-50 p-4 rounded"
                    >
                      <div className="font-semibold text-orange-900 mb-2">
                        {format(hourDate, "h:mm a")} — {hour.osha_alert?.message}
                      </div>
                      {hour.osha_alert?.actions && hour.osha_alert.actions.length > 0 && (
                        <ul className="list-disc list-inside space-y-1 text-sm text-orange-800">
                          {hour.osha_alert.actions.map((action: string, i: number) => (
                            <li key={i}>{action}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
























