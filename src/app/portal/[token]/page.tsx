"use client";

// Block 227000 — SmartSend Roofing Customer Portal + Live Job Tracking v1
// Premium Customer Portal — Makes roofers look like a $20M company

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Home,
  FileText,
  DollarSign,
  Clock,
  Image as ImageIcon,
  MessageSquare,
  CheckCircle2,
  Calendar,
  Package,
  Download,
  ExternalLink,
  AlertCircle,
  Loader2,
  Shield,
} from "lucide-react";
import { WarrantyServiceTab } from "@/components/portal/WarrantyServiceTab";

type PortalData = {
  homeowner: {
    id: string;
    name: string;
    email: string;
  } | null;
  job: {
    id: string;
    title: string | null;
    status: string;
    address: string | null;
    job_value: number | null;
    progress: number;
    nextMilestone: string | null;
  };
  estimate: any;
  contract: {
    id: string;
    status: string;
    signature_date: string | null;
    contract_html: string | null;
  } | null;
  invoices: Array<{
    id: string;
    type: string;
    amount: number;
    amount_due?: number;
    due_date: string | null;
    status: string;
    stripe_payment_link?: string;
    payment_link?: string;
  }>;
  photos: Array<{
    id: string;
    photo_url: string;
    url?: string;
    category: string;
    created_at: string;
  }>;
  messages: Array<{
    id: string;
    sender_type: string;
    sender_name: string;
    message: string;
    created_at: string;
  }>;
  timeline: Array<{
    id: string;
    event_type: string;
    title: string;
    body: string | null;
    created_at: string;
  }>;
  schedule: {
    start_date: string;
    end_date: string | null;
    crew: { name: string } | null;
  } | null;
};

export default function CustomerPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/customer/portal/${token}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.ok) {
          setData(result);
        } else {
          setError(result.error || "Failed to load portal data");
        }
      })
      .catch((err) => {
        console.error("Error loading portal:", err);
        setError("Failed to load portal data");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const sendMessage = async () => {
    if (!messageText.trim() || !token) return;

    setSendingMessage(true);
    try {
      const res = await fetch("/api/customer/portal/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          message: messageText,
          sender_name: data?.homeowner?.name || "Homeowner",
          sender_email: data?.homeowner?.email || null,
        }),
      });

      const result = await res.json();
      if (result.ok) {
        setMessageText("");
        // Refresh messages
        fetch(`/api/customer/portal/${token}`)
          .then((res) => res.json())
          .then((result) => {
            if (result.ok) {
              setData(result);
            }
          });
      }
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSendingMessage(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      unscheduled: { label: "Pending Start", variant: "outline" },
      scheduled: { label: "Scheduled", variant: "default" },
      in_progress: { label: "In Progress", variant: "default" },
      completed: { label: "Completed", variant: "secondary" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-32 w-full mb-6" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">{error || "Failed to load portal"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const photosByCategory = {
    before: data.photos.filter((p) => p.category === "before"),
    during: data.photos.filter((p) => p.category === "during"),
    after: data.photos.filter((p) => p.category === "after"),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Your Project Portal</h1>
              <p className="text-sm text-gray-600 mt-1">{data.job.address || "Roofing Project"}</p>
            </div>
            {getStatusBadge(data.job.status)}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Payments</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Photos</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Messages</span>
            </TabsTrigger>
            <TabsTrigger value="warranty-service" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Warranty & Service</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Job Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle>Job Summary</CardTitle>
                <CardDescription>Overview of your roofing project</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Contract Value</p>
                    <p className="text-2xl font-bold">
                      ${data.job.job_value?.toLocaleString() || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Progress</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={data.job.progress} className="flex-1" />
                      <span className="text-sm font-medium">{data.job.progress}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <div className="mt-1">{getStatusBadge(data.job.status)}</div>
                  </div>
                </div>

                {data.job.nextMilestone && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900">Next Milestone</p>
                        <p className="text-sm text-blue-700 mt-1">{data.job.nextMilestone}</p>
                      </div>
                    </div>
                  </div>
                )}

                {data.schedule && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Package className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-900">Crew Scheduled</p>
                        <p className="text-sm text-green-700 mt-1">
                          {data.schedule.crew?.name || "Crew"} scheduled for{" "}
                          {new Date(data.schedule.start_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Progress Milestones */}
            <Card>
              <CardHeader>
                <CardTitle>Progress Milestones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "Contract Signed", completed: data.contract?.status === "signed" },
                    {
                      label: "Deposit Paid",
                      completed: data.invoices.some((inv) => inv.type === "deposit" && inv.status === "paid"),
                    },
                    {
                      label: "Materials Delivered",
                      completed: data.timeline.some((e) => e.event_type === "materials_delivered"),
                    },
                    {
                      label: "Crew Started",
                      completed: data.timeline.some((e) => e.event_type === "crew_started"),
                    },
                    {
                      label: "Work In Progress",
                      completed: data.job.status === "in_progress",
                    },
                    { label: "Job Completed", completed: data.job.status === "completed" },
                  ].map((milestone, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      {milestone.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                      <span
                        className={milestone.completed ? "text-gray-900" : "text-gray-500"}
                      >
                        {milestone.label}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>View and download your project documents</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.estimate && (
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-600" />
                      <div>
                        <p className="font-medium">Estimate</p>
                        <p className="text-sm text-gray-600">
                          ${data.estimate.total?.toLocaleString() || "N/A"}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                )}

                {data.contract && (
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-600" />
                      <div>
                        <p className="font-medium">Contract</p>
                        <p className="text-sm text-gray-600">
                          {data.contract.status === "signed" ? (
                            <span className="text-green-600">Signed</span>
                          ) : (
                            <span className="text-yellow-600">Awaiting Signature</span>
                          )}
                          {data.contract.signature_date &&
                            ` on ${new Date(data.contract.signature_date).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {data.contract.status === "signed" ? (
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      ) : (
                        <Button variant="default" size="sm">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Sign Contract
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Payment Schedule</CardTitle>
                <CardDescription>View and pay your invoices</CardDescription>
              </CardHeader>
              <CardContent>
                {data.invoices.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No invoices available</p>
                ) : (
                  <div className="space-y-4">
                    {data.invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium capitalize">{invoice.type} Payment</p>
                          <p className="text-sm text-gray-600">
                            Amount: ${(invoice.amount_due || invoice.amount).toLocaleString()}
                            {invoice.due_date &&
                              ` • Due: ${new Date(invoice.due_date).toLocaleDateString()}`}
                          </p>
                          <Badge
                            variant={
                              invoice.status === "paid"
                                ? "secondary"
                                : invoice.status === "overdue"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="mt-2"
                          >
                            {invoice.status}
                          </Badge>
                        </div>
                        {invoice.status !== "paid" && (invoice.stripe_payment_link || invoice.payment_link) && (
                          <Button
                            variant="default"
                            onClick={() => {
                              window.open(invoice.stripe_payment_link || invoice.payment_link, "_blank");
                            }}
                          >
                            Pay Now
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Job Timeline</CardTitle>
                <CardDescription>Track your project progress</CardDescription>
              </CardHeader>
              <CardContent>
                {data.timeline.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No timeline events yet</p>
                ) : (
                  <div className="space-y-4">
                    {data.timeline.map((event) => (
                      <div key={event.id} className="flex gap-4 pb-4 border-b last:border-0">
                        <div className="flex-shrink-0">
                          <div className="h-2 w-2 rounded-full bg-blue-600 mt-2" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{event.title}</p>
                          {event.body && <p className="text-sm text-gray-600 mt-1">{event.body}</p>}
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(event.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Photos</CardTitle>
                <CardDescription>Before, during, and after photos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {["before", "during", "after"].map((category) => {
                  const categoryPhotos = photosByCategory[category as keyof typeof photosByCategory];
                  if (categoryPhotos.length === 0) return null;

                  return (
                    <div key={category}>
                      <h3 className="font-medium text-lg mb-3 capitalize">{category} Photos</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {categoryPhotos.map((photo) => (
                          <div
                            key={photo.id}
                            className="aspect-square rounded-lg overflow-hidden border cursor-pointer hover:opacity-90 transition"
                            onClick={() => {
                              window.open(photo.photo_url || photo.url, "_blank");
                            }}
                          >
                            <img
                              src={photo.photo_url || photo.url}
                              alt={`${category} photo`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {data.photos.length === 0 && (
                  <p className="text-gray-600 text-center py-8">No photos available yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Messages</CardTitle>
                <CardDescription>Communicate with your roofing team</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {data.messages.length === 0 ? (
                    <p className="text-gray-600 text-center py-8">No messages yet</p>
                  ) : (
                    data.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.sender_type === "homeowner" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            message.sender_type === "homeowner"
                              ? "bg-blue-600 text-white"
                              : "bg-gray-200 text-gray-900"
                          }`}
                        >
                          <p className="text-sm font-medium mb-1">{message.sender_name}</p>
                          <p className="text-sm">{message.message}</p>
                          <p className="text-xs opacity-75 mt-2">
                            {new Date(message.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button onClick={sendMessage} disabled={!messageText.trim() || sendingMessage}>
                    {sendingMessage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Send"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Warranty & Service Tab */}
          <TabsContent value="warranty-service" className="space-y-6">
            <WarrantyServiceTab
              token={token}
              jobId={data.job.id}
              homeownerId={data.homeowner?.id}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
