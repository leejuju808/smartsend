"use client";

/**
 * Block 15900 — SmartSend Local Weather Engine v1
 * Weather Dashboard Page
 * Path: /insights/weather
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CloudRain, Wind, Snowflake, Droplets, Zap, MapPin, Calendar, Users, TrendingUp } from "lucide-react";

interface WeatherEvent {
  id: string;
  storm_type: string;
  zip: string;
  severity: string;
  storm_started_at: string;
  storm_ended_at?: string;
  hail_size?: number;
  wind_speed?: number;
  rain_inches?: number;
  storm_intensity_score: number;
  nws_headline?: string;
}

interface StormTrigger {
  id: string;
  status: string;
  suggested_at: string;
  affected_contacts_count: number;
  affected_zips: string[];
  storm_summary: string;
  weather_event: WeatherEvent;
  campaign?: {
    id: string;
    name: string;
    status: string;
  };
}

interface WeatherStats {
  totalEvents: number;
  highSeverityEvents: number;
  averageIntensity: number;
  totalAffectedContacts: number;
  highRiskContacts: number;
  mediumRiskContacts: number;
  suggestedTriggers: number;
  startedTriggers: number;
  stormTypeBreakdown: Record<string, number>;
}

export default function WeatherDashboardPage() {
  const [stats, setStats] = useState<WeatherStats | null>(null);
  const [events, setEvents] = useState<WeatherEvent[]>([]);
  const [triggers, setTriggers] = useState<StormTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWeatherData() {
      try {
        setLoading(true);
        
        // Fetch stats
        const statsRes = await fetch("/api/weather/stats?days=30");
        if (!statsRes.ok) throw new Error("Failed to fetch stats");
        const statsData = await statsRes.json();
        setStats(statsData.stats);

        // Fetch recent events
        const eventsRes = await fetch("/api/weather/events?limit=20");
        if (!eventsRes.ok) throw new Error("Failed to fetch events");
        const eventsData = await eventsRes.json();
        setEvents(eventsData.events || []);

        // Fetch triggers
        const triggersRes = await fetch("/api/weather/triggers?status=suggested");
        if (!triggersRes.ok) throw new Error("Failed to fetch triggers");
        const triggersData = await triggersRes.json();
        setTriggers(triggersData.triggers || []);

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load weather data");
      } finally {
        setLoading(false);
      }
    }

    fetchWeatherData();
  }, []);

  const handleStartCampaign = async (triggerId: string) => {
    try {
      const res = await fetch("/api/weather/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_id: triggerId,
          status: "started",
        }),
      });

      if (!res.ok) throw new Error("Failed to start campaign");

      // Refresh triggers
      const triggersRes = await fetch("/api/weather/triggers?status=suggested");
      const triggersData = await triggersRes.json();
      setTriggers(triggersData.triggers || []);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start campaign");
    }
  };

  const getStormIcon = (stormType: string) => {
    switch (stormType) {
      case "hail":
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case "wind":
        return <Wind className="w-5 h-5 text-blue-600" />;
      case "heavy_rain":
        return <CloudRain className="w-5 h-5 text-blue-500" />;
      case "snow_load":
        return <Snowflake className="w-5 h-5 text-cyan-500" />;
      case "freeze_thaw":
        return <Droplets className="w-5 h-5 text-blue-400" />;
      default:
        return <Zap className="w-5 h-5 text-orange-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "extreme":
        return "bg-red-100 text-red-800 border-red-300";
      case "severe":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "high":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "medium":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-800">Error loading weather data</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Weather Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Real-time storm tracking, ZIP-level alerts, and campaign triggers for your service area
          </p>
        </div>
      </header>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Events</p>
                <p className="text-2xl font-bold">{stats.totalEvents}</p>
              </div>
              <Zap className="w-8 h-8 text-orange-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {stats.highSeverityEvents} high severity
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Affected Contacts</p>
                <p className="text-2xl font-bold">{stats.totalAffectedContacts}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {stats.highRiskContacts} high risk, {stats.mediumRiskContacts} medium risk
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Intensity</p>
                <p className="text-2xl font-bold">{stats.averageIntensity}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Out of 100</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Campaign Triggers</p>
                <p className="text-2xl font-bold">{stats.suggestedTriggers}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {stats.startedTriggers} started
            </p>
          </div>
        </div>
      )}

      {/* Suggested Campaign Triggers */}
      {triggers.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Suggested Storm Campaigns</h2>
          <div className="space-y-4">
            {triggers.map((trigger) => (
              <div
                key={trigger.id}
                className="flex items-start justify-between p-4 rounded-lg border bg-muted/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getStormIcon(trigger.weather_event.storm_type)}
                    <span className="font-medium capitalize">
                      {trigger.weather_event.storm_type.replace("_", " ")}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(
                        trigger.weather_event.severity
                      )}`}
                    >
                      {trigger.weather_event.severity}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {trigger.storm_summary}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {trigger.affected_zips.join(", ")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {trigger.affected_contacts_count} contacts
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(trigger.suggested_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleStartCampaign(trigger.id)}
                  className="ml-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
                >
                  Start Campaign
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Storm Events */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Storm Events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent storm events detected.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="mt-1">{getStormIcon(event.storm_type)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium capitalize">
                      {event.storm_type.replace("_", " ")}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(
                        event.severity
                      )}`}
                    >
                      {event.severity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ZIP: {event.zip}
                    </span>
                  </div>
                  {event.nws_headline && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {event.nws_headline}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {event.hail_size && (
                      <span>Hail: {event.hail_size}"</span>
                    )}
                    {event.wind_speed && (
                      <span>Wind: {event.wind_speed} mph</span>
                    )}
                    {event.rain_inches && (
                      <span>Rain: {event.rain_inches}"</span>
                    )}
                    <span>Intensity: {event.storm_intensity_score}/100</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(event.storm_started_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Storm Type Breakdown */}
      {stats && Object.keys(stats.stormTypeBreakdown).length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Storm Type Breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.stormTypeBreakdown).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 p-3 rounded-lg border">
                {getStormIcon(type)}
                <div>
                  <p className="font-medium capitalize text-sm">
                    {type.replace("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">{count} events</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

