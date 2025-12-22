"use client";

// Warranty & Service Tab for Customer Portal
// Shows warranty overview, service request form, and existing tickets

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Wrench,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Upload,
  X,
} from "lucide-react";

type Warranty = {
  id: string;
  warranty_type: string;
  start_date: string;
  end_date: string;
  document_url: string | null;
  coverage_description: string | null;
  is_active: boolean;
  expires_soon: boolean;
};

type ServiceTicket = {
  id: string;
  ticket_number: string;
  ticket_type: string;
  description: string;
  priority: string;
  status: string;
  scheduled_date: string | null;
  completed_date: string | null;
  is_warranty_covered: boolean;
  created_at: string;
  assignments?: Array<{
    crew?: { name: string };
    scheduled_date: string;
    scheduled_time: string | null;
  }>;
  logs?: Array<{
    resolution: string;
    completed_at: string;
  }>;
};

type WarrantyServiceTabProps = {
  token: string;
  jobId: string;
  homeownerId?: string;
};

export function WarrantyServiceTab({ token, jobId, homeownerId }: WarrantyServiceTabProps) {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [ticketType, setTicketType] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [requestedDate, setRequestedDate] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);

  useEffect(() => {
    loadData();
  }, [token, jobId]);

  const loadData = async () => {
    try {
      // Load warranties
      const warrantyRes = await fetch(`/api/warranty/list?job_id=${jobId}`);
      const warrantyData = await warrantyRes.json();
      if (warrantyData.warranties) {
        setWarranties(warrantyData.warranties);
      }

      // Load service tickets (if homeowner_id available)
      if (homeownerId) {
        const ticketsRes = await fetch(`/api/service/tickets?homeowner_id=${homeownerId}`);
        const ticketsData = await ticketsRes.json();
        if (ticketsData.tickets) {
          setTickets(ticketsData.tickets);
        }
      }
    } catch (error) {
      console.error("Error loading warranty/service data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos(Array.from(e.target.files));
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const uploadPhotos = async (files: File[]): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    // TODO: Implement photo upload to Supabase Storage
    // For now, return empty array
    return uploadedUrls;
  };

  const handleSubmitServiceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketType || !description) return;

    setSubmitting(true);
    try {
      // Upload photos first
      const photoUrls = await uploadPhotos(photos);

      const response = await fetch("/api/service/ticket/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeowner_id: homeownerId,
          job_id: jobId,
          ticket_type: ticketType,
          description,
          priority,
          requested_date: requestedDate || null,
          photo_urls: photoUrls,
        }),
      });

      const result = await response.json();
      if (result.ticket) {
        setShowRequestForm(false);
        setTicketType("");
        setDescription("");
        setPriority("normal");
        setRequestedDate("");
        setPhotos([]);
        loadData(); // Refresh tickets
      }
    } catch (error) {
      console.error("Error submitting service request:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      open: { label: "Open", variant: "outline" },
      scheduled: { label: "Scheduled", variant: "default" },
      in_progress: { label: "In Progress", variant: "default" },
      completed: { label: "Completed", variant: "secondary" },
      closed: { label: "Closed", variant: "secondary" },
    };

    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-gray-100 text-gray-800",
      normal: "bg-blue-100 text-blue-800",
      high: "bg-orange-100 text-orange-800",
      urgent: "bg-red-100 text-red-800",
    };
    return (
      <Badge className={colors[priority] || colors.normal}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading warranty and service information...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Warranty Overview Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Warranty Overview
          </CardTitle>
          <CardDescription>Your warranty coverage and documents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {warranties.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No warranties found for this job.</p>
            </div>
          ) : (
            warranties.map((warranty) => (
              <div key={warranty.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium capitalize">{warranty.warranty_type.replace("_", " ")} Warranty</p>
                    {warranty.expires_soon && (
                      <Badge variant="destructive" className="mt-1">
                        Expires Soon
                      </Badge>
                    )}
                  </div>
                  {warranty.document_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={warranty.document_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        View Document
                      </a>
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Start Date</p>
                    <p className="font-medium">
                      {new Date(warranty.start_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">End Date</p>
                    <p className="font-medium">
                      {new Date(warranty.end_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {warranty.coverage_description && (
                  <div>
                    <p className="text-sm text-gray-600">Coverage</p>
                    <p className="text-sm">{warranty.coverage_description}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Request Service Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Request Service
          </CardTitle>
          <CardDescription>Submit a service request for your property</CardDescription>
        </CardHeader>
        <CardContent>
          {!showRequestForm ? (
            <Button onClick={() => setShowRequestForm(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Submit Service Request
            </Button>
          ) : (
            <form onSubmit={handleSubmitServiceRequest} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Issue Type</label>
                <Select value={ticketType} onValueChange={setTicketType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select issue type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leak">Leak</SelectItem>
                    <SelectItem value="shingle_missing">Missing Shingles</SelectItem>
                    <SelectItem value="gutter_issue">Gutter Issue</SelectItem>
                    <SelectItem value="siding">Siding</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="warranty_check">Warranty Check</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue..."
                  rows={4}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Priority</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Preferred Date (Optional)</label>
                <Input
                  type="date"
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Photos (Optional)</label>
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                />
                {photos.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {photos.map((photo, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span>{photo.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removePhoto(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Request"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowRequestForm(false);
                    setTicketType("");
                    setDescription("");
                    setPriority("normal");
                    setRequestedDate("");
                    setPhotos([]);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Existing Service Tickets Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Service Tickets
          </CardTitle>
          <CardDescription>Track your service requests</CardDescription>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Wrench className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No service tickets yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">#{ticket.ticket_number}</p>
                      <p className="text-sm text-gray-600 capitalize">
                        {ticket.ticket_type.replace("_", " ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getPriorityBadge(ticket.priority)}
                      {getStatusBadge(ticket.status)}
                    </div>
                  </div>

                  <p className="text-sm">{ticket.description}</p>

                  {ticket.is_warranty_covered && (
                    <Badge variant="secondary" className="w-fit">
                      <Shield className="h-3 w-3 mr-1" />
                      Warranty Covered
                    </Badge>
                  )}

                  {ticket.assignments && ticket.assignments.length > 0 && (
                    <div className="text-sm text-gray-600">
                      <p>
                        <strong>Crew:</strong> {ticket.assignments[0].crew?.name || "Assigned"}
                      </p>
                      {ticket.assignments[0].scheduled_date && (
                        <p>
                          <strong>Scheduled:</strong>{" "}
                          {new Date(ticket.assignments[0].scheduled_date).toLocaleDateString()}
                          {ticket.assignments[0].scheduled_time && ` at ${ticket.assignments[0].scheduled_time}`}
                        </p>
                      )}
                    </div>
                  )}

                  {ticket.logs && ticket.logs.length > 0 && ticket.logs[0].resolution && (
                    <div className="bg-green-50 border border-green-200 rounded p-3">
                      <p className="text-sm font-medium text-green-900">Resolution</p>
                      <p className="text-sm text-green-700 mt-1">
                        {ticket.logs[0].resolution}
                      </p>
                      {ticket.logs[0].completed_at && (
                        <p className="text-xs text-green-600 mt-2">
                          Completed: {new Date(ticket.logs[0].completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

























