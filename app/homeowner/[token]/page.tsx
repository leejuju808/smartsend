"use client";

// Block 44000 — SmartSend Roofing Homeowner Portal + Live Job Tracker v1
// Public homeowner portal page accessible via magic link token
// Features: Live job status, photo feed, timeline, change orders, messaging, payments

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/src/components/ui/skeleton";
import { JobHeader } from "./components/JobHeader";
import { PhotoGallery } from "./components/PhotoGallery";
import { NotesFeed } from "./components/NotesFeed";
import { NextStepCard } from "./components/NextStepCard";
import { FooterBranding } from "./components/FooterBranding";
import { PaymentCenter } from "./components/PaymentCenter";
import { MessagesSection } from "./components/MessagesSection";
import { DocumentsSection } from "./components/DocumentsSection";
import { WhoIsOnTheJob } from "./components/WhoIsOnTheJob";
import { WarrantyPackageSection } from "./components/WarrantyPackageSection";
import { LiveTimelineFeed } from "./components/LiveTimelineFeed";
import { ChangeOrderApproval } from "./components/ChangeOrderApproval";
import { CloseoutPacketSection } from "./components/CloseoutPacketSection";
import { QCVerification } from "./components/QCVerification";
import { ServiceRequestButton } from "./components/ServiceRequestButton";
// Block 94000 - Experience Engine components
import { WhatsNextBlock } from "./components/WhatsNextBlock";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { JourneyTimeline } from "./components/JourneyTimeline";
import { FeedbackBanner } from "./components/FeedbackBanner";

type PortalData = {
  job: {
    id: string;
    name: string;
    address: string | null;
    status: string;
    progress_percent: number;
    crew_name: string | null;
    scheduled_date: string | null;
  };
  photos: {
    before: Array<{
      id: string;
      url: string;
      category: string;
      created_at: string;
    }>;
    during: Array<{
      id: string;
      url: string;
      category: string;
      created_at: string;
    }>;
    after: Array<{
      id: string;
      url: string;
      category: string;
      created_at: string;
    }>;
    issues: Array<{
      id: string;
      url: string;
      category: string;
      created_at: string;
    }>;
  };
  timeline: Array<{
    id: string;
    timestamp: string;
    title: string;
    description: string;
    type: string;
  }>;
  messages: Array<{
    id: string;
    sender: "homeowner" | "office";
    message: string;
    created_at: string;
  }>;
  change_orders: Array<{
    id: string;
    description: string;
    amount: number;
    status: "pending" | "approved" | "rejected";
    photos: Array<{
      id: string;
      photo_url: string;
      label: string | null;
    }>;
    homeowner_action: {
      action: "approved" | "declined";
      created_at: string;
    } | null;
    created_at: string;
  }>;
  closeout_packet: {
    id: string;
    pdf_url: string;
    summary_text: string | null;
    generated_at: string;
  } | null;
  // Block 94000 - Experience Engine data
  milestones?: Array<{
    id: string;
    milestone_type: string;
    status: "pending" | "in_progress" | "completed";
    completed_at: string | null;
  }>;
  current_milestone?: {
    milestone_type: string;
    status: string;
    completed_at: string | null;
  } | null;
  preferences?: {
    id: string;
    prefers_sms: boolean;
    prefers_email: boolean;
    update_frequency: "minimal" | "normal" | "detailed" | null;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
  } | null;
  active_feedback_trigger?: string | null;
  portal_id?: string;
};

export default function HomeownerPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchPortalData = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/homeowner-job-feed`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to load portal data");
        }

        const portalData = await response.json();
        setData(portalData);
      } catch (err: any) {
        console.error("Error fetching portal data:", err);
        setError(err.message || "Failed to load portal");
      } finally {
        setLoading(false);
      }
    };

    fetchPortalData();
  }, [token]);

  const refreshData = () => {
    if (!token) return;
    const fetchPortalData = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/homeowner-job-feed`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token }),
          }
        );

        if (response.ok) {
          const portalData = await response.json();
          setData(portalData);
        }
      } catch (err: any) {
        console.error("Error refreshing portal data:", err);
      }
    };

    fetchPortalData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Unable to Load Portal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              {error || "The portal link is invalid or has expired. Please contact your roofing company for a new link."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { 
    job, 
    photos, 
    timeline, 
    messages, 
    change_orders, 
    closeout_packet,
    milestones = [],
    current_milestone = null,
    preferences = null,
    active_feedback_trigger = null,
    portal_id,
  } = data;

  // Flatten photos for PhotoGallery component (backwards compatibility)
  const allPhotos = [
    ...(photos.before || []).map((p) => ({ ...p, tag: "before", caption: null })),
    ...(photos.during || []).map((p) => ({ ...p, tag: "during", caption: null })),
    ...(photos.after || []).map((p) => ({ ...p, tag: "after", caption: null })),
    ...(photos.issues || []).map((p) => ({ ...p, tag: "issue", caption: null })),
  ];

  // Format messages for MessagesSection (backwards compatibility)
  const formattedMessages = (messages || []).map((msg) => ({
    id: msg.id,
    subject: null,
    body_text: msg.message,
    direction: msg.sender === "homeowner" ? "inbound" : "outbound",
    created_at: msg.created_at,
    from_address: null,
  }));

  // Get status badge color
  const getStatusColor = (status: string) => {
    const statusColors: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-800",
      crew_en_route: "bg-purple-100 text-purple-800",
      in_progress: "bg-yellow-100 text-yellow-800",
      mid_install: "bg-orange-100 text-orange-800",
      cleanup: "bg-green-100 text-green-800",
      completed: "bg-green-100 text-green-800",
      inspection: "bg-indigo-100 text-indigo-800",
      final_walkthrough: "bg-emerald-100 text-emerald-800",
    };
    return statusColors[status] || "bg-gray-100 text-gray-800";
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: "Scheduled",
      crew_en_route: "Crew En Route",
      in_progress: "In Progress",
      mid_install: "Mid-Install",
      cleanup: "Cleanup",
      completed: "Completed",
      inspection: "Inspection",
      final_walkthrough: "Final Walkthrough",
    };
    return labels[status] || status;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        {/* Job Header */}
        <JobHeader job={job} />

        {/* Block 94000 - What's Next Block (Clarity Engine) */}
        {current_milestone !== null && (
          <WhatsNextBlock
            currentMilestone={current_milestone}
            allMilestones={milestones}
            jobStatus={job.status}
            scheduledDate={job.scheduled_date}
            crewName={job.crew_name}
          />
        )}

        {/* Block 94000 - Active Feedback Banner */}
        {active_feedback_trigger && (
          <FeedbackBanner
            portalToken={token}
            jobId={job.id}
            triggerType={active_feedback_trigger as any}
            question={undefined}
            onSubmitted={refreshData}
          />
        )}

        {/* Job Status Banner */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Current Status</p>
                  <Badge className={getStatusColor(job.status)}>
                    {getStatusLabel(job.status)}
                  </Badge>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {job.progress_percent}%
                </span>
              </div>
              <Progress value={job.progress_percent} className="h-3" />
            </div>
          </CardContent>
        </Card>

        {/* Block 94000 - Journey Timeline */}
        {milestones.length > 0 && (
          <JourneyTimeline milestones={milestones} />
        )}

        {/* Live Timeline Feed */}
        {timeline && timeline.length > 0 && (
          <LiveTimelineFeed timeline={timeline} />
        )}

        {/* Change Order Approval */}
        {change_orders && change_orders.length > 0 && (
          <ChangeOrderApproval
            changeOrders={change_orders}
            portalToken={token}
            onUpdate={refreshData}
          />
        )}

        {/* Closeout Packet Section */}
        {closeout_packet && (
          <CloseoutPacketSection closeoutPacket={closeout_packet} />
        )}

        {/* QC Verification Section */}
        {job.status === "completed" && (
          <QCVerification
            jobId={job.id}
            token={token}
            qcInspection={null} // Will be fetched by component
            existingVerification={null} // Will be fetched by component
            onVerified={refreshData}
          />
        )}

        {/* Photo Gallery */}
        {allPhotos.length > 0 && <PhotoGallery photos={allPhotos} />}

        {/* Messages Section */}
        <MessagesSection messages={formattedMessages} portalToken={token} />

        {/* Block 92000 - Service Request Button */}
        {(job.status === "completed" || job.status === "in_progress") && (
          <Card>
            <CardContent className="pt-6">
              <ServiceRequestButton
                jobId={job.id}
                homeownerName={job.name || "Homeowner"}
                homeownerAddress={job.address || undefined}
                token={token}
              />
            </CardContent>
          </Card>
        )}

        {/* Block 94000 - Preferences Panel */}
        <PreferencesPanel
          portalToken={token}
          jobId={job.id}
          initialPreferences={preferences}
        />

        {/* Block 94000 - Self-Serve Reschedule Request */}
        {(job.status === "scheduled" || job.status === "in_progress") && (
          <RescheduleRequest
            portalToken={token}
            jobId={job.id}
            currentScheduledDate={job.scheduled_date}
            onSubmitted={refreshData}
          />
        )}

        {/* Footer Branding */}
        <FooterBranding />
      </div>
    </div>
  );
}

