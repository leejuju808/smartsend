"use client";

// Block 243000 — SmartSend Roofing CX Hub
// Office/Manager view of customer portal activity

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Activity,
  TrendingDown,
  TrendingUp,
  Clock,
  Shield,
} from "lucide-react";

type CustomerActivity = {
  homeowner: any;
  job: any;
  portalActivity: {
    loginCount: number;
    lastLogin: string | null;
    accessToken: string;
    createdAt: string;
  };
  messageHistory: Array<any>;
  unreadMessageCount: number;
  serviceRequests: Array<any>;
  unresolvedServiceCount: number;
  sentiment: {
    value: string;
    score: number;
  };
  paymentStatus: {
    totalPaid: number;
    totalDue: number;
    remaining: number;
    progress: number;
  };
};

export default function CustomerPortalActivityPage() {
  const params = useParams();
  const homeownerId = params.homeownerId as string;
  const [data, setData] = useState<{ customers: CustomerActivity[]; summary: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!homeownerId) return;

    fetch(`/api/customer/office/view?homeowner_id=${homeownerId}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.ok) {
          setData(result);
        }
      })
      .catch((err) => {
        console.error("Error loading customer activity:", err);
      })
      .finally(() => setLoading(false));
  }, [homeownerId]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-white rounded-lg" />
          <div className="h-96 bg-white rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data || data.customers.length === 0) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-600">No customer activity found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const customer = data.customers[0];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Customer Portal Activity</h1>
        <p className="text-gray-600 mt-2">
          {customer.homeowner?.name || "Customer"} • {customer.job?.address || "Job"}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="service">Service Requests</TabsTrigger>
          <TabsTrigger value="activity">Portal Activity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Unread Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customer.unreadMessageCount}</div>
                {customer.unreadMessageCount > 0 && (
                  <Badge variant="destructive" className="mt-2">Action Required</Badge>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Service Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customer.unresolvedServiceCount}</div>
                {customer.unresolvedServiceCount > 0 && (
                  <Badge variant="outline" className="mt-2">Unresolved</Badge>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Customer Sentiment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {customer.sentiment.value === "negative" ? (
                    <>
                      <TrendingDown className="h-5 w-5 text-red-500" />
                      <span className="text-lg font-semibold text-red-600">Negative</span>
                    </>
                  ) : customer.sentiment.value === "positive" ? (
                    <>
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      <span className="text-lg font-semibold text-green-600">Positive</span>
                    </>
                  ) : (
                    <span className="text-lg font-semibold">Neutral</span>
                  )}
                </div>
                {customer.sentiment.value === "negative" && (
                  <Badge variant="destructive" className="mt-2">Needs Attention</Badge>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Payment Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Math.round(customer.paymentStatus.progress)}%</div>
                <p className="text-sm text-gray-600 mt-1">
                  ${customer.paymentStatus.totalPaid.toFixed(2)} / ${customer.paymentStatus.totalDue.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Job Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Job Timeline</CardTitle>
              <CardDescription>Customer's view of their project</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium">Portal Access Created</p>
                      <p className="text-sm text-gray-600">
                        {new Date(customer.portalActivity.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>

                {customer.portalActivity.lastLogin && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Activity className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium">Last Login</p>
                        <p className="text-sm text-gray-600">
                          {new Date(customer.portalActivity.lastLogin).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium">Total Messages</p>
                      <p className="text-sm text-gray-600">{customer.messageHistory.length} messages exchanged</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Message History</CardTitle>
              <CardDescription>
                {customer.unreadMessageCount > 0 && (
                  <Badge variant="destructive">{customer.unreadMessageCount} unread</Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {customer.messageHistory.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No messages yet</p>
              ) : (
                <div className="space-y-4">
                  {customer.messageHistory.map((msg: any) => (
                    <div key={msg.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={msg.sender_type === "homeowner" ? "default" : "secondary"}>
                            {msg.sender_type === "homeowner" ? "Customer" : "Company"}
                          </Badge>
                          {msg.sender_name && <span className="text-sm font-medium">{msg.sender_name}</span>}
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-gray-700">{msg.message}</p>
                      {msg.sender_type === "homeowner" && !msg.read_at && (
                        <Badge variant="outline" className="mt-2">Unread</Badge>
                      )}
                    </div>
                  ))}
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
              <CardDescription>
                {customer.unresolvedServiceCount > 0 && (
                  <Badge variant="outline">{customer.unresolvedServiceCount} unresolved</Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {customer.serviceRequests.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No service requests</p>
              ) : (
                <div className="space-y-4">
                  {customer.serviceRequests.map((req: any) => (
                    <div key={req.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
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
                        <span className="text-xs text-gray-500">
                          {new Date(req.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-gray-700 mb-2">{req.description}</p>
                      {req.resolution_notes && (
                        <div className="bg-gray-50 rounded p-2 mt-2">
                          <p className="text-sm text-gray-600">
                            <strong>Resolution:</strong> {req.resolution_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Portal Activity Tab */}
        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Portal Activity</CardTitle>
              <CardDescription>Customer engagement with the portal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Portal Access Token</p>
                <p className="font-mono text-xs bg-gray-100 p-2 rounded mt-1">
                  {customer.portalActivity.accessToken}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Portal Created</p>
                  <p className="font-medium">
                    {new Date(customer.portalActivity.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Last Login</p>
                  <p className="font-medium">
                    {customer.portalActivity.lastLogin
                      ? new Date(customer.portalActivity.lastLogin).toLocaleString()
                      : "Never"}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Payment Status</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Paid</span>
                    <span className="font-medium">${customer.paymentStatus.totalPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Due</span>
                    <span className="font-medium">${customer.paymentStatus.totalDue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Remaining</span>
                    <span className="font-medium text-red-600">
                      ${customer.paymentStatus.remaining.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

























