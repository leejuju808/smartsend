"use client";

// Block 243000 — SmartSend Roofing CX Hub
// Customer Portal 2.0 — Enhanced with AI Assistant and Service Requests

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Bot,
  Send,
  Upload,
  Wrench,
  AlertTriangle,
} from "lucide-react";

type PortalData = {
  homeowner: {
    id: string;
    name: string;
    email: string;
  } | null;
  jobs: Array<{
    id: string;
    status: string;
    address: string | null;
    contract_value: number | null;
    progress: number;
    statusStages: {
      signed: boolean;
      scheduled: boolean;
      materials_ordered: boolean;
      materials_delivered: boolean;
      work_started: boolean;
      work_in_progress: boolean;
      work_completed: boolean;
      final_walkthrough: boolean;
      paid_in_full: boolean;
    };
    estimate: any;
    contract: any;
    invoices: Array<any>;
    payments: {
      totalPaid: number;
      totalDue: number;
      remaining: number;
    };
    photos: Array<any>;
    messages: Array<any>;
    timeline: Array<any>;
    serviceRequests: Array<any>;
    schedule: any;
  }>;
};

export function CustomerPortal2({ homeownerId, token }: { homeownerId: string; token?: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [serviceRequestType, setServiceRequestType] = useState<"leak" | "repair" | "warranty" | "inspection" | "other">("other");
  const [serviceRequestDesc, setServiceRequestDesc] = useState("");
  const [submittingServiceRequest, setSubmittingServiceRequest] = useState(false);

  useEffect(() => {
    if (!homeownerId) return;

    const endpoint = token
      ? `/api/customer/portal/${token}`
      : `/api/customer/portal/${homeownerId}`;

    fetch(endpoint)
      .then((res) => res.json())
      .then((result) => {
        if (result.ok) {
          setData(result);
          if (result.jobs && result.jobs.length > 0) {
            setSelectedJob(result.jobs[0].id);
          }
        } else {
          setError(result.error || "Failed to load portal data");
        }
      })
      .catch((err) => {
        console.error("Error loading portal:", err);
        setError("Failed to load portal data");
      })
      .finally(() => setLoading(false));
  }, [homeownerId, token]);

  const currentJob = data?.jobs?.find((j) => j.id === selectedJob) || data?.jobs?.[0];

  const sendMessage = async () => {
    if (!messageText.trim() || !currentJob) return;

    setSendingMessage(true);
    try {
      const res = await fetch("/api/customer/message/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeowner_id: data?.homeowner?.id,
          job_id: currentJob.id,
          sender: "customer",
          message: messageText,
          sender_name: data?.homeowner?.name || "Homeowner",
          sender_email: data?.homeowner?.email || null,
        }),
      });

      const result = await res.json();
      if (result.ok) {
        setMessageText("");
        // Refresh data
        window.location.reload();
      }
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSendingMessage(false);
    }
  };

  const askAI = async () => {
    if (!aiQuestion.trim() || !currentJob || !data?.homeowner) return;

    setAiLoading(true);
    setAiAnswer(null);
    try {
      const res = await fetch("/api/customer/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeowner_id: data.homeowner.id,
          job_id: currentJob.id,
          question: aiQuestion,
        }),
      });

      const result = await res.json();
      if (result.ok) {
        setAiAnswer(result.answer);
      }
    } catch (err) {
      console.error("Error asking AI:", err);
      setAiAnswer("I'm sorry, I'm having trouble right now. Please try again later.");
    } finally {
      setAiLoading(false);
    }
  };

  const submitServiceRequest = async () => {
    if (!serviceRequestDesc.trim() || !currentJob || !data?.homeowner) return;

    setSubmittingServiceRequest(true);
    try {
      const res = await fetch("/api/customer/service/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeowner_id: data.homeowner.id,
          job_id: currentJob.id,
          type: serviceRequestType,
          description: serviceRequestDesc,
          photos: [], // Would support photo upload in production
        }),
      });

      const result = await res.json();
      if (result.ok) {
        setServiceRequestDesc("");
        setServiceRequestType("other");
        alert("Service request submitted successfully!");
        // Refresh data
        window.location.reload();
      }
    } catch (err) {
      console.error("Error submitting service request:", err);
      alert("Failed to submit service request. Please try again.");
    } finally {
      setSubmittingServiceRequest(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
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
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-white rounded-lg" />
            <div className="h-96 bg-white rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data || !currentJob) {
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
    before: currentJob.photos?.filter((p: any) => p.category === "before") || [],
    during: currentJob.photos?.filter((p: any) => p.category === "during") || [],
    after: currentJob.photos?.filter((p: any) => p.category === "after") || [],
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Customer Experience Hub</h1>
              <p className="text-sm text-gray-600 mt-1">
                {currentJob.address || "Roofing Project"} • {data.homeowner?.name}
              </p>
            </div>
            {getStatusBadge(currentJob.status)}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="dashboard">
              <Home className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <Clock className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="photos">
              <ImageIcon className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Photos</span>
            </TabsTrigger>
            <TabsTrigger value="messages">
              <MessageSquare className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Messages</span>
            </TabsTrigger>
            <TabsTrigger value="payments">
              <DollarSign className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Payments</span>
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="service">
              <Shield className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Service</span>
            </TabsTrigger>
            <TabsTrigger value="ai-assistant">
              <Bot className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">AI Assistant</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Job Status Stages Visual Bar */}
            <Card>
              <CardHeader>
                <CardTitle>Job Status</CardTitle>
                <CardDescription>Track your project progress</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Progress value={currentJob.progress} className="h-3" />
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    {[
                      { key: "signed", label: "Signed" },
                      { key: "scheduled", label: "Scheduled" },
                      { key: "materials_delivered", label: "Materials Delivered" },
                      { key: "work_started", label: "Work Started" },
                      { key: "work_completed", label: "Work Completed" },
                    ].map((stage) => (
                      <div key={stage.key} className="flex items-center gap-2">
                        {currentJob.statusStages[stage.key as keyof typeof currentJob.statusStages] ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                        )}
                        <span className={currentJob.statusStages[stage.key as keyof typeof currentJob.statusStages] ? "" : "text-gray-500"}>
                          {stage.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Job Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Job Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Contract Value</p>
                    <p className="text-2xl font-bold">
                      ${currentJob.contract_value?.toLocaleString() || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Progress</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={currentJob.progress} className="flex-1" />
                      <span className="text-sm font-medium">{currentJob.progress}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Payment Progress</p>
                    <p className="text-lg font-semibold">
                      ${currentJob.payments?.totalPaid?.toFixed(2) || "0.00"} / ${currentJob.payments?.totalDue?.toFixed(2) || "0.00"}
                    </p>
                  </div>
                </div>

                {currentJob.schedule && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-900">Crew Scheduled</p>
                        <p className="text-sm text-green-700 mt-1">
                          {currentJob.schedule.crew?.name || "Crew"} scheduled for{" "}
                          {new Date(currentJob.schedule.start_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Photo Timeline</CardTitle>
                <CardDescription>Before → During → After</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {["before", "during", "after"].map((category) => {
                    const photos = photosByCategory[category as keyof typeof photosByCategory];
                    if (photos.length === 0) return null;
                    return (
                      <div key={category}>
                        <h3 className="font-medium capitalize mb-3">{category} Photos</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {photos.map((photo: any) => (
                            <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden border">
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
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {currentJob.timeline?.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No timeline events yet</p>
                ) : (
                  <div className="space-y-4">
                    {currentJob.timeline?.map((event: any) => (
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

          {/* Photos Tab - Same as timeline photos section */}
          <TabsContent value="photos" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Photos</CardTitle>
                <CardDescription>View photos from your roofing project</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {["before", "during", "after"].map((category) => {
                    const photos = photosByCategory[category as keyof typeof photosByCategory];
                    return (
                      <div key={category}>
                        <h3 className="font-medium capitalize mb-3">{category} Photos ({photos.length})</h3>
                        {photos.length === 0 ? (
                          <p className="text-gray-500 text-sm">No {category} photos yet</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {photos.map((photo: any) => (
                              <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden border">
                                <img
                                  src={photo.photo_url || photo.url}
                                  alt={`${category} photo`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                  {currentJob.messages?.map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === "customer" || msg.sender_type === "homeowner" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          msg.sender === "customer" || msg.sender_type === "homeowner"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-200 text-gray-900"
                        }`}
                      >
                        <p className="text-sm">{msg.message}</p>
                        <p className="text-xs mt-1 opacity-75">
                          {new Date(msg.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type your message..."
                    onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  />
                  <Button onClick={sendMessage} disabled={sendingMessage || !messageText.trim()}>
                    {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Payment Tracking</CardTitle>
                <CardDescription>View payment history and make payments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-600">Total Paid</p>
                      <p className="text-2xl font-bold">${currentJob.payments?.totalPaid?.toFixed(2) || "0.00"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Remaining Balance</p>
                      <p className="text-2xl font-bold text-red-600">
                        ${currentJob.payments?.remaining?.toFixed(2) || "0.00"}
                      </p>
                    </div>
                  </div>
                </div>

                {currentJob.invoices?.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No invoices available</p>
                ) : (
                  <div className="space-y-4">
                    {currentJob.invoices?.map((invoice: any) => (
                      <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium capitalize">{invoice.type || "Invoice"} Payment</p>
                          <p className="text-sm text-gray-600">
                            Amount: ${(invoice.amount_due || invoice.amount).toLocaleString()}
                            {invoice.due_date && ` • Due: ${new Date(invoice.due_date).toLocaleDateString()}`}
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
                        {invoice.status !== "paid" && (
                          <Button variant="default">Pay Now</Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contracts & Documents</CardTitle>
                <CardDescription>Access all your project documents</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentJob.contract && (
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-600" />
                      <div>
                        <p className="font-medium">Contract</p>
                        <p className="text-sm text-gray-600">
                          {currentJob.contract.status === "signed" ? (
                            <span className="text-green-600">Signed</span>
                          ) : (
                            <span className="text-yellow-600">Awaiting Signature</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                )}
                {currentJob.estimate && (
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-600" />
                      <div>
                        <p className="font-medium">Estimate</p>
                        <p className="text-sm text-gray-600">
                          ${currentJob.estimate.total?.toLocaleString() || "N/A"}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Service Requests Tab */}
          <TabsContent value="service" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Service Requests</CardTitle>
                <CardDescription>Submit warranty claims, report leaks, or request repairs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Existing Service Requests */}
                {currentJob.serviceRequests && currentJob.serviceRequests.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-medium">Your Service Requests</h3>
                    {currentJob.serviceRequests.map((req: any) => (
                      <div key={req.id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">{req.type}</Badge>
                              <Badge
                                variant={
                                  req.status === "resolved" ? "secondary" : req.status === "in_progress" ? "default" : "outline"
                                }
                              >
                                {req.status}
                              </Badge>
                            </div>
                            <p className="mt-2">{req.description}</p>
                            <p className="text-xs text-gray-500 mt-2">
                              Submitted {new Date(req.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* New Service Request Form */}
                <div className="border-t pt-6">
                  <h3 className="font-medium mb-4">Submit New Service Request</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Request Type</label>
                      <select
                        value={serviceRequestType}
                        onChange={(e) => setServiceRequestType(e.target.value as any)}
                        className="w-full mt-1 px-3 py-2 border rounded-md"
                      >
                        <option value="leak">Leak Report</option>
                        <option value="repair">Repair Request</option>
                        <option value="warranty">Warranty Claim</option>
                        <option value="inspection">Inspection Request</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={serviceRequestDesc}
                        onChange={(e) => setServiceRequestDesc(e.target.value)}
                        placeholder="Describe your service request..."
                        rows={4}
                        className="mt-1"
                      />
                    </div>
                    <Button
                      onClick={submitServiceRequest}
                      disabled={submittingServiceRequest || !serviceRequestDesc.trim()}
                    >
                      {submittingServiceRequest ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Submit Request
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Assistant Tab */}
          <TabsContent value="ai-assistant" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>AI Homeowner Assistant</CardTitle>
                <CardDescription>Ask questions about your project</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Bot className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-900">How can I help?</p>
                      <p className="text-sm text-blue-700 mt-1">
                        Ask me about your crew schedule, payment balance, contract, job status, or anything else about your project.
                      </p>
                    </div>
                  </div>
                </div>

                {aiAnswer && (
                  <div className="bg-gray-50 border rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Bot className="h-5 w-5 text-gray-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium mb-2">AI Assistant</p>
                        <p className="text-gray-700">{aiAnswer}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Input
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    placeholder="Ask a question... (e.g., 'When will my crew arrive?')"
                    onKeyPress={(e) => e.key === "Enter" && askAI()}
                  />
                  <div className="flex gap-2">
                    <Button onClick={askAI} disabled={aiLoading || !aiQuestion.trim()} className="flex-1">
                      {aiLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Thinking...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Ask AI
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-gray-500 space-y-1">
                  <p className="font-medium">Example questions:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>"When will my crew arrive?"</li>
                    <li>"What is my remaining balance?"</li>
                    <li>"Show me my contract"</li>
                    <li>"What stage are we at?"</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

























