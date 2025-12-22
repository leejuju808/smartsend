"use client";

// Block 200000 — SmartSend Roofing Homeowner Portal + Real-Time Project Tracker v1
// Public portal page accessible via portal code with PIN + last name authentication

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, XCircle, Image as ImageIcon, MessageSquare, FileText, DollarSign, TrendingUp } from "lucide-react";
import Image from "next/image";

type PortalData = {
  portal: {
    id: string;
    portal_code: string;
    homeowner_name: string;
    contractor_name: string | null;
    contractor_logo_url: string | null;
  };
  job: {
    id: string;
    address: string | null;
    homeowner_name: string;
    homeowner_email: string | null;
    homeowner_phone: string | null;
    stage: string | null;
    progress: number | null;
    production_date: string | null;
    estimated_value: number | null;
    final_value: number | null;
    insurance_claim: boolean;
  };
  timeline: Array<{
    id: string;
    event_type: string;
    title: string;
    description: string | null;
    created_at: string;
  }>;
  photos: Array<{
    id: string;
    photo_url: string;
    caption: string | null;
    photo_type: string;
    uploaded_at: string;
  }>;
  chat_messages: Array<{
    id: string;
    message_type: string;
    sender_name: string | null;
    body: string;
    created_at: string;
  }>;
  notifications: Array<{
    id: string;
    notification_type: string;
    message: string;
    sent_at: string;
  }>;
  insurance_claim?: {
    claim_number: string | null;
    carrier_name: string | null;
    claim_status: string | null;
    deductible: number | null;
    acv_amount: number | null;
    rcv_amount: number | null;
    depreciation_amount: number | null;
    acv_paid: number | null;
    rcv_paid: number | null;
    supplement_requested: number | null;
    supplement_approved: number | null;
  };
  measurement?: {
    total_squares: number | null;
    squares_min: number | null;
    squares_max: number | null;
    pitch_value: string | null;
    pitch_category: string | null;
    ridges_linear_ft: number | null;
    valleys_linear_ft: number | null;
    rakes_linear_ft: number | null;
    eaves_linear_ft: number | null;
    waste_factor_percent: number | null;
    complexity_rating: string | null;
  };
  materials?: {
    bundles: number | null;
    ridge_bundles: number | null;
    underlayment: string | null;
    drip_edge: number | null;
    ice_water_shield: number | null;
    materials_list: string[] | null;
  };
};

export default function HomeownerPortalPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pinCode, setPinCode] = useState("");
  const [lastName, setLastName] = useState("");

  // Check if already authenticated
  useEffect(() => {
    checkAuthentication();
  }, [code]);

  const checkAuthentication = async () => {
    try {
      const response = await fetch("/api/portal/data");
      if (response.ok) {
        const data = await response.json();
        if (data && !data.error) {
          setAuthenticated(true);
          setPortalData(data);
          setLoading(false);
          return;
        }
      }
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  };

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/portal/authenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          portalCode: code,
          pinCode: pinCode.trim(),
          lastName: lastName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Authentication failed. Please check your PIN and last name.");
        setAuthLoading(false);
        return;
      }

      setAuthenticated(true);
      
      // Fetch portal data
      const dataResponse = await fetch("/api/portal/data");
      if (dataResponse.ok) {
        const portalData = await dataResponse.json();
        setPortalData(portalData);
      }
      
      setAuthLoading(false);
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
      setAuthLoading(false);
    }
  };

  const loadPortalData = async () => {
    try {
      const response = await fetch("/api/portal/data");
      if (response.ok) {
        const data = await response.json();
        setPortalData(data);
      }
    } catch (err) {
      console.error("Failed to load portal data:", err);
    }
  };

  // Refresh data periodically
  useEffect(() => {
    if (!authenticated) return;

    loadPortalData();
    const interval = setInterval(loadPortalData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [authenticated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">SmartSend Project Portal</CardTitle>
            <p className="text-gray-600 mt-2">
              Enter your PIN and last name to access your project
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuthenticate} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIN Code
                </label>
                <Input
                  type="text"
                  placeholder="Enter 4-digit PIN"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  maxLength={4}
                  required
                  className="text-center text-2xl tracking-widest"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <Input
                  type="text"
                  placeholder="Enter your last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="text-lg"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={authLoading || pinCode.length !== 4 || !lastName.trim()}
              >
                {authLoading ? "Authenticating..." : "Access Portal"}
              </Button>
            </form>

            <p className="text-xs text-gray-500 text-center mt-4">
              Your PIN was sent to you via SMS when your portal was created.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!portalData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  const { portal, job, timeline, photos, chat_messages, notifications } = portalData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {portal.homeowner_name}&apos;s Project Portal
              </h1>
              <p className="text-gray-600 mt-1">{job.address}</p>
            </div>
            {portal.contractor_logo_url && (
              <div className="h-16 w-32 relative">
                <Image
                  src={portal.contractor_logo_url}
                  alt={portal.contractor_name || "Contractor"}
                  fill
                  className="object-contain"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Project Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Project Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Progress</span>
                  <span className="font-medium">{job.progress || 0}%</span>
                </div>
                <Progress value={job.progress || 0} className="h-2" />
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Current Stage</p>
                  <p className="font-semibold">{job.stage || "Not started"}</p>
                </div>
                {job.production_date && (
                  <div>
                    <p className="text-sm text-gray-600">Production Date</p>
                    <p className="font-semibold">
                      {new Date(job.production_date).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {job.insurance_claim && (
                  <div>
                    <p className="text-sm text-gray-600">Insurance Claim</p>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                )}
                {job.final_value && (
                  <div>
                    <p className="text-sm text-gray-600">Project Value</p>
                    <p className="font-semibold">
                      ${job.final_value.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Project Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {timeline && timeline.length > 0 ? (
                timeline.map((event) => (
                  <div key={event.id} className="flex gap-4">
                    <div className="flex-shrink-0">
                      {event.event_type === "status_update" && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                      {event.event_type === "photo_added" && (
                        <ImageIcon className="h-5 w-5 text-blue-500" />
                      )}
                      {event.event_type === "crew_assigned" && (
                        <Clock className="h-5 w-5 text-orange-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{event.title}</p>
                      {event.description && (
                        <p className="text-sm text-gray-600">{event.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(event.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">No timeline events yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Photo Feed */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Progress Photos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {photos && photos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-200">
                    <Image
                      src={photo.photo_url}
                      alt={photo.caption || "Progress photo"}
                      fill
                      className="object-cover"
                    />
                    {photo.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2">
                        {photo.caption}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No photos uploaded yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Insurance Tracker */}
        {job.insurance_claim && insurance_claim && (
          <div className="mb-6">
            <InsuranceTracker claim={insurance_claim} />
          </div>
        )}

        {/* Measurements & Materials */}
        {(measurement || materials) && (
          <div className="mb-6 space-y-6">
            <MeasurementsSection measurement={measurement || null} materials={materials || null} />
          </div>
        )}

        {/* Chat */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChatSection portalCode={code} initialMessages={chat_messages || []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Chat component
function ChatSection({ portalCode, initialMessages }: { portalCode: string; initialMessages: any[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const response = await fetch("/api/portal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newMessage }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [data.message, ...prev]);
        setNewMessage("");
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 h-64 overflow-y-auto space-y-3">
        {messages.length > 0 ? (
          [...messages].reverse().map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.message_type === "homeowner" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.message_type === "homeowner"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                {msg.sender_name && (
                  <p className="text-xs font-medium mb-1">{msg.sender_name}</p>
                )}
                <p className="text-sm">{msg.body}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(msg.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500 text-center py-8">No messages yet. Start a conversation!</p>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your message..."
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
        />
        <Button onClick={sendMessage} disabled={sending || !newMessage.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}


























