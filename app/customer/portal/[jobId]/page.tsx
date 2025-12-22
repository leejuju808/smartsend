"use client";

// Block 252300 — SmartSend Customer Communication Engine v1
// Customer Portal (NO LOGIN REQUIRED)
// URL: smartsend.app/customer/j/ABC123

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  Clock,
  Image,
  MessageSquare,
  FileText,
  Shield,
  Phone,
  Mail,
  Calendar,
  Truck,
  Hammer,
  Home,
} from "lucide-react";

type PortalData = {
  job: {
    id: string;
    title: string;
    status: string;
    scheduled_date: string | null;
    production_date: string | null;
    address: string | null;
    homeowner_name: string | null;
    homeowner_phone: string | null;
    homeowner_email: string | null;
  };
  milestones: Array<{
    id: string;
    name: string;
    status: string;
    completed_date: string | null;
    scheduled_date: string | null;
  }>;
  photos: Array<{
    id: string;
    url: string;
    stage: string;
    label: string | null;
    created_at: string;
  }>;
  messages: Array<{
    id: string;
    event_type: string;
    message_body: string;
    sent_at: string;
    metadata: any;
  }>;
  timeline: Array<{
    id: string;
    event_type: string;
    message: string;
    timestamp: string;
    metadata: any;
  }>;
  foreman: {
    name: string | null;
    phone: string | null;
  } | null;
  warranty_link: string | null;
};

export default function CustomerPortalPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!jobId) return;

    fetch(`/api/customer/portal/job/${jobId}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.ok) {
          setData(result.data);
        } else {
          setError(result.error || "Failed to load portal data");
        }
      })
      .catch((err) => {
        console.error("Error loading portal:", err);
        setError("Failed to load portal data");
      })
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your project...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">{error || "Unable to load project information"}</p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      estimate: { label: "Estimate", variant: "outline" },
      approved: { label: "Approved", variant: "default" },
      scheduled: { label: "Scheduled", variant: "default" },
      in_progress: { label: "In Progress", variant: "default" },
      completed: { label: "Complete", variant: "default" },
    };
    const statusInfo = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const getMilestoneIcon = (name: string) => {
    if (name.toLowerCase().includes("material")) return <Truck className="w-4 h-4" />;
    if (name.toLowerCase().includes("tear")) return <Hammer className="w-4 h-4" />;
    if (name.toLowerCase().includes("complete")) return <CheckCircle2 className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  const photosByStage = {
    before: data.photos.filter((p) => p.stage === "before"),
    during: data.photos.filter((p) => p.stage === "during"),
    after: data.photos.filter((p) => p.stage === "after"),
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{data.job.title || "Your Roofing Project"}</h1>
              <p className="text-sm text-gray-600 mt-1">{data.job.address}</p>
            </div>
            {getStatusBadge(data.job.status)}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Job Status Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Job Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600">Current Status</p>
                    <div className="mt-1">{getStatusBadge(data.job.status)}</div>
                  </div>
                  {data.job.scheduled_date && (
                    <div>
                      <p className="text-sm text-gray-600">Scheduled Date</p>
                      <p className="text-sm font-medium mt-1">
                        {new Date(data.job.scheduled_date).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {data.job.production_date && (
                    <div>
                      <p className="text-sm text-gray-600">Production Date</p>
                      <p className="text-sm font-medium mt-1">
                        {new Date(data.job.production_date).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.foreman && (
                    <div>
                      <p className="text-sm text-gray-600">Project Manager</p>
                      <p className="text-sm font-medium mt-1">{data.foreman.name || "Not assigned"}</p>
                      {data.foreman.phone && (
                        <a
                          href={`tel:${data.foreman.phone}`}
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1"
                        >
                          <Phone className="w-3 h-3" />
                          {data.foreman.phone}
                        </a>
                      )}
                    </div>
                  )}
                  {data.job.homeowner_phone && (
                    <div>
                      <p className="text-sm text-gray-600">Your Phone</p>
                      <p className="text-sm font-medium mt-1">{data.job.homeowner_phone}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Milestones */}
            <Card>
              <CardHeader>
                <CardTitle>Project Milestones</CardTitle>
                <CardDescription>Track your project progress</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.milestones.map((milestone) => (
                    <div
                      key={milestone.id}
                      className="flex items-center gap-4 p-4 border rounded-lg"
                    >
                      <div className="flex-shrink-0">
                        {milestone.status === "completed" ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        ) : milestone.status === "in_progress" ? (
                          <Clock className="w-6 h-6 text-blue-600" />
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{milestone.name}</p>
                        {milestone.completed_date && (
                          <p className="text-sm text-gray-600">
                            Completed: {new Date(milestone.completed_date).toLocaleDateString()}
                          </p>
                        )}
                        {milestone.scheduled_date && !milestone.completed_date && (
                          <p className="text-sm text-gray-600">
                            Scheduled: {new Date(milestone.scheduled_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Timeline</CardTitle>
                <CardDescription>All updates and communications</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.timeline.map((event) => (
                    <div key={event.id} className="flex gap-4 pb-4 border-b last:border-0">
                      <div className="flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-blue-600 mt-2" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{event.message}</p>
                        <p className="text-xs text-gray-600 mt-1">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {data.timeline.length === 0 && (
                    <p className="text-center text-gray-500 py-8">No timeline events yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos" className="space-y-6">
            {photosByStage.before.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Before Photos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {photosByStage.before.map((photo) => (
                      <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                        <img
                          src={photo.url}
                          alt={photo.label || "Before photo"}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {photosByStage.during.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>During Photos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {photosByStage.during.map((photo) => (
                      <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                        <img
                          src={photo.url}
                          alt={photo.label || "During photo"}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {photosByStage.after.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>After Photos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {photosByStage.after.map((photo) => (
                      <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                        <img
                          src={photo.url}
                          alt={photo.label || "After photo"}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.photos.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No photos uploaded yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Messages</CardTitle>
                <CardDescription>All communications about your project</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.messages.map((message) => (
                    <div key={message.id} className="p-4 border rounded-lg">
                      <p className="text-sm font-medium mb-2">{message.message_body}</p>
                      <p className="text-xs text-gray-600">
                        {new Date(message.sent_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {data.messages.length === 0 && (
                    <p className="text-center text-gray-500 py-8">No messages yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>Project documents and warranty information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.warranty_link && (
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="font-medium">Warranty Packet</p>
                          <p className="text-sm text-gray-600">Your warranty documents</p>
                        </div>
                      </div>
                      <Button asChild>
                        <a href={data.warranty_link} target="_blank" rel="noopener noreferrer">
                          View Warranty
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
                {!data.warranty_link && (
                  <p className="text-center text-gray-500 py-8">Warranty packet will be available after completion</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
























