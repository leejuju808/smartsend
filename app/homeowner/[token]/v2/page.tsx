"use client";

// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// Main homeowner portal page with all v2 features

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DailyPhotoFeed } from "../components/v2/DailyPhotoFeed";
import { MilestoneTracker } from "../components/v2/MilestoneTracker";
import { LiveJobMap } from "../components/v2/LiveJobMap";
import { HomeownerNotifications } from "../components/v2/HomeownerNotifications";
import { HomeownerChat } from "../components/v2/HomeownerChat";
import { SatisfactionPulse } from "../components/v2/SatisfactionPulse";
import { JobHeader } from "../components/JobHeader";
import { FooterBranding } from "../components/FooterBranding";
import { RefreshCw, AlertCircle } from "lucide-react";

interface PortalData {
  job: {
    id: string;
    name: string;
    address: string | null;
    status: string;
    progress_percent?: number;
    crew_name: string | null;
    scheduled_date: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  portal: {
    photos: Array<{
      id: string;
      photo_url: string;
      caption: string | null;
      photo_type: "before" | "during" | "after";
      uploaded_at: string;
    }>;
    milestones: Array<{
      id: string;
      milestone: string;
      status: "not_started" | "in_progress" | "completed";
      completed_at: string | null;
    }>;
    crew_status: {
      status: string;
      location_type: string | null;
      latitude: number | null;
      longitude: number | null;
      address: string | null;
      timestamp: string | null;
    };
    recent_notifications: Array<{
      id: string;
      type: string;
      message: string;
      sent_at: string;
      read_at: string | null;
    }>;
  };
  messages: Array<{
    id: string;
    sender: "homeowner" | "office";
    message: string;
    created_at: string;
  }>;
}

export default function HomeownerPortalV2Page() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPortalData = async () => {
    try {
      if (!token) return;

      const response = await fetch(
        `/api/homeowner/portal-data?token=${encodeURIComponent(token)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load portal data");
      }

      const portalData = await response.json();
      if (portalData.success && portalData.job) {
        setData({
          job: portalData.job,
          portal: portalData.portal || {
            photos: [],
            milestones: [],
            crew_status: {
              status: "not_arrived",
              location_type: null,
              latitude: null,
              longitude: null,
              address: null,
              timestamp: null,
            },
            recent_notifications: [],
          },
          messages: portalData.messages || [],
        });
        setError(null);
      } else {
        throw new Error("Invalid portal data");
      }
    } catch (err: any) {
      console.error("Error fetching portal data:", err);
      setError(err.message || "Failed to load portal");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPortalData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchPortalData();
    }, 30000);

    return () => clearInterval(interval);
  }, [token]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPortalData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <h2 className="text-xl font-semibold text-red-600">
                Unable to Load Portal
              </h2>
            </div>
            <p className="text-gray-600">
              {error ||
                "The portal link is invalid or has expired. Please contact your roofing company for a new link."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { job, portal, messages } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Your Roof Project</h1>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 text-white">
          <h2 className="text-2xl font-bold mb-2">
            Welcome to your roof project — here's today's progress.
          </h2>
          <p className="text-blue-100">
            Track every step of your roofing project in real-time.
          </p>
        </div>

        {/* Job Header */}
        <JobHeader
          job={{
            id: job.id,
            name: job.name || "Your Roofing Project",
            address: job.address,
            status: job.status,
            progress_percent: job.progress_percent || 0,
            crew_name: job.crew_name,
            scheduled_date: job.scheduled_date,
          }}
        />

        {/* Live Map and Notifications Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LiveJobMap
            crewStatus={portal.crew_status}
            jobAddress={job.address}
            jobLatitude={job.latitude}
            jobLongitude={job.longitude}
          />
          <HomeownerNotifications
            notifications={portal.recent_notifications}
          />
        </div>

        {/* Milestone Tracker */}
        <MilestoneTracker milestones={portal.milestones} />

        {/* Photo Feed */}
        <DailyPhotoFeed photos={portal.photos} />

        {/* Chat and Satisfaction Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HomeownerChat token={token} initialMessages={messages} />
          <SatisfactionPulse token={token} />
        </div>
      </div>

      {/* Footer */}
      <FooterBranding />
    </div>
  );
}




























