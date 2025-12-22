// Block 92000 — SmartSend Roofing Service Ticket Detail View v1

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Shield,
  Camera,
  Wrench,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  User,
  Calendar,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/src/components/ui/skeleton";
import Image from "next/image";

interface ServiceTicketDetailViewProps {
  ticketId: string;
}

export function ServiceTicketDetailView({ ticketId }: ServiceTicketDetailViewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    loadTicket();
  }, [ticketId]);

  const loadTicket = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/service-tickets/${ticketId}`);

      if (!response.ok) {
        throw new Error("Failed to load ticket");
      }

      const data = await response.json();
      setTicket(data.ticket);
    } catch (error: any) {
      console.error("Error loading ticket:", error);
      toast.error("Failed to load service ticket");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const response = await fetch(`/api/service-tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticket_status: newStatus,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      toast.success("Status updated");
      loadTicket();
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleCheckWarranty = async () => {
    if (!ticket?.issue_category) {
      toast.error("Issue category is required to check warranty");
      return;
    }

    try {
      const response = await fetch(
        `/api/service-tickets/${ticketId}/check-warranty`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            issue_category: ticket.issue_category,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to check warranty");
      }

      toast.success("Warranty coverage checked");
      loadTicket();
    } catch (error: any) {
      console.error("Error checking warranty:", error);
      toast.error("Failed to check warranty coverage");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6">
        <p className="text-red-500">Service ticket not found</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800";
      case "scheduled":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-purple-100 text-purple-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "emergency":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "normal":
        return "bg-blue-100 text-blue-800";
      case "low":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/service-tickets")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Service Ticket</h1>
            <p className="text-sm text-muted-foreground">
              {ticket.homeowner_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(ticket.ticket_status)}>
            {ticket.ticket_status}
          </Badge>
          <Badge className={getPriorityColor(ticket.priority)}>
            {ticket.priority}
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="warranty">Warranty</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="crew">Crew</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ticket Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Homeowner</Label>
                  <p className="text-sm font-medium">{ticket.homeowner_name}</p>
                  {ticket.homeowner_email && (
                    <p className="text-xs text-muted-foreground">
                      {ticket.homeowner_email}
                    </p>
                  )}
                  {ticket.homeowner_phone && (
                    <p className="text-xs text-muted-foreground">
                      {ticket.homeowner_phone}
                    </p>
                  )}
                </div>

                <div>
                  <Label>Status</Label>
                  <Select
                    value={ticket.ticket_status}
                    onValueChange={handleStatusChange}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Issue Category</Label>
                  <p className="text-sm">{ticket.issue_category || "Not specified"}</p>
                </div>

                <div>
                  <Label>Priority</Label>
                  <Select
                    value={ticket.priority}
                    onValueChange={async (value) => {
                      await fetch(`/api/service-tickets/${ticketId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ priority: value }),
                      });
                      loadTicket();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Issue Description</Label>
                <Textarea
                  value={ticket.issue_description}
                  readOnly
                  className="mt-1"
                  rows={4}
                />
              </div>

              {ticket.job && (
                <div>
                  <Label>Related Job</Label>
                  <p className="text-sm">
                    {ticket.job.title || ticket.job.address || "Job #" + ticket.job.id.slice(0, 8)}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Labor Cost</Label>
                  <Input
                    type="number"
                    value={ticket.labor_cost || 0}
                    onChange={async (e) => {
                      await fetch(`/api/service-tickets/${ticketId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ labor_cost: parseFloat(e.target.value) || 0 }),
                      });
                      loadTicket();
                    }}
                  />
                </div>
                <div>
                  <Label>Material Cost</Label>
                  <Input
                    type="number"
                    value={ticket.material_cost || 0}
                    onChange={async (e) => {
                      await fetch(`/api/service-tickets/${ticketId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ material_cost: parseFloat(e.target.value) || 0 }),
                      });
                      loadTicket();
                    }}
                  />
                </div>
                <div>
                  <Label>Total Cost</Label>
                  <p className="text-sm font-medium">
                    ${((ticket.labor_cost || 0) + (ticket.material_cost || 0)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <Label>Charged Amount</Label>
                  <Input
                    type="number"
                    value={ticket.charged_amount || 0}
                    onChange={async (e) => {
                      await fetch(`/api/service-tickets/${ticketId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ charged_amount: parseFloat(e.target.value) || 0 }),
                      });
                      loadTicket();
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Photos</CardTitle>
            </CardHeader>
            <CardContent>
              {ticket.photos && ticket.photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {ticket.photos.map((photo: any) => (
                    <div key={photo.id} className="relative aspect-square">
                      <Image
                        src={photo.photo_url}
                        alt={photo.description || "Service ticket photo"}
                        fill
                        className="object-cover rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No photos attached</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Warranty Tab */}
        <TabsContent value="warranty" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Warranty Coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.warranty ? (
                <div className="space-y-4">
                  <div>
                    <Label>Warranty Type</Label>
                    <p className="text-sm font-medium">{ticket.warranty.warranty_type}</p>
                  </div>
                  {ticket.warranty.end_date && (
                    <div>
                      <Label>Warranty End Date</Label>
                      <p className="text-sm">
                        {format(new Date(ticket.warranty.end_date), "MMM d, yyyy")}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={ticket.is_warranty_covered ? "default" : "destructive"}
                    >
                      {ticket.is_warranty_covered ? "Covered" : "Not Covered"}
                    </Badge>
                    {ticket.should_charge_homeowner && (
                      <Badge variant="outline">Charge Homeowner</Badge>
                    )}
                  </div>
                  {ticket.warranty_coverage_notes && (
                    <div>
                      <Label>Coverage Notes</Label>
                      <p className="text-sm">{ticket.warranty_coverage_notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No warranty linked</p>
              )}
              <Button onClick={handleCheckWarranty} variant="outline">
                <Shield className="h-4 w-4 mr-2" />
                Check Warranty Coverage
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Actions & Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {ticket.actions && ticket.actions.length > 0 ? (
                <div className="space-y-4">
                  {ticket.actions
                    .sort(
                      (a: any, b: any) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                    )
                    .map((action: any) => (
                      <div
                        key={action.id}
                        className="flex items-start gap-3 pb-4 border-b last:border-0"
                      >
                        <div className="mt-1">
                          {action.action_type === "completion" && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {action.action_type === "repair" && (
                            <Wrench className="h-4 w-4 text-blue-500" />
                          )}
                          {action.action_type === "inspection" && (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          )}
                          {!["completion", "repair", "inspection"].includes(
                            action.action_type
                          ) && (
                            <FileText className="h-4 w-4 text-gray-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{action.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(action.created_at), "MMM d, yyyy h:mm a")}
                            {action.performed_by_user && (
                              <> • {action.performed_by_user.email}</>
                            )}
                          </p>
                          {action.cost > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Cost: ${action.cost.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No actions recorded</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Crew Tab */}
        <TabsContent value="crew" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Crew Assignment</CardTitle>
            </CardHeader>
            <CardContent>
              {ticket.assignments && ticket.assignments.length > 0 ? (
                <div className="space-y-4">
                  {ticket.assignments.map((assignment: any) => (
                    <div key={assignment.id} className="space-y-2">
                      {assignment.crew && (
                        <div>
                          <Label>Crew</Label>
                          <p className="text-sm font-medium">
                            {assignment.crew.name}
                            {assignment.crew.foreman_name && (
                              <> • {assignment.crew.foreman_name}</>
                            )}
                          </p>
                        </div>
                      )}
                      <div>
                        <Label>Scheduled Date</Label>
                        <p className="text-sm">
                          {format(new Date(assignment.scheduled_date), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div>
                        <Label>Status</Label>
                        <Badge>{assignment.status}</Badge>
                      </div>
                      {assignment.notes && (
                        <div>
                          <Label>Notes</Label>
                          <p className="text-sm">{assignment.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No crew assigned</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm font-medium">Ticket Created</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(ticket.created_at), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                </div>
                {ticket.scheduled_date && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-sm font-medium">Scheduled</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ticket.scheduled_date), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                )}
                {ticket.completed_at && (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-1" />
                    <div>
                      <p className="text-sm font-medium">Completed</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ticket.completed_at), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                  </div>
                )}
                {ticket.closed_at && (
                  <div className="flex items-start gap-3">
                    <XCircle className="h-4 w-4 text-gray-500 mt-1" />
                    <div>
                      <p className="text-sm font-medium">Closed</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ticket.closed_at), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}



























