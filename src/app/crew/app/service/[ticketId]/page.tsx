"use client";

// Service Job Detail - Crew workflow for service tickets
// Block 229000 — SmartSend Roofing Warranty Manager + Service Ticket System

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Wrench,
  Camera,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Upload,
  FileText,
} from "lucide-react";

type ServiceTicket = {
  id: string;
  ticket_number: string;
  ticket_type: string;
  description: string;
  priority: string;
  status: string;
  property_address: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  is_warranty_covered: boolean;
  assignments?: Array<{
    id: string;
    scheduled_date: string;
    scheduled_time: string | null;
    status: string;
  }>;
};

export default function ServiceJobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.ticketId as string;

  const [ticket, setTicket] = useState<ServiceTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("");
  const [workPerformed, setWorkPerformed] = useState("");
  const [materialsUsed, setMaterialsUsed] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [upsellOpportunity, setUpsellOpportunity] = useState(false);
  const [upsellDescription, setUpsellDescription] = useState("");
  const [upsellValue, setUpsellValue] = useState("");

  useEffect(() => {
    loadTicket();
  }, [ticketId]);

  const loadTicket = async () => {
    try {
      const response = await fetch(`/api/service/tickets?ticket_id=${ticketId}`);
      const data = await response.json();
      if (data.tickets && data.tickets.length > 0) {
        setTicket(data.tickets[0]);
      }
    } catch (error) {
      console.error("Error loading ticket:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos(Array.from(e.target.files));
    }
  };

  const uploadPhotos = async (files: File[]): Promise<string[]> => {
    // TODO: Implement photo upload to Supabase Storage
    return [];
  };

  const handleStartService = async () => {
    // Update assignment status to "on_site"
    // This would be handled by the assignment update API
  };

  const handleCompleteService = async () => {
    if (!resolution) {
      alert("Please provide a resolution");
      return;
    }

    setSubmitting(true);
    try {
      // Upload photos first
      const photoUrls = await uploadPhotos(photos);

      const response = await fetch("/api/service/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: ticketId,
          notes,
          resolution,
          work_performed: workPerformed,
          materials_used: materialsUsed,
          upsell_opportunity: upsellOpportunity,
          upsell_description: upsellDescription || null,
          upsell_estimated_value: upsellValue ? parseFloat(upsellValue) : null,
        }),
      });

      const result = await response.json();
      if (result.service_log) {
        router.push("/crew/app/home");
      }
    } catch (error) {
      console.error("Error completing service:", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading service job...</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Service ticket not found</p>
          <Button onClick={() => router.push("/crew/app/home")} className="mt-4">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-orange-600 text-white p-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/crew/app/home")}
            className="text-white hover:bg-orange-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Service Job</h1>
            <p className="text-sm opacity-90">#{ticket.ticket_number}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Ticket Info Card */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold capitalize">
              {ticket.ticket_type.replace("_", " ")}
            </h2>
            <div className="flex items-center gap-2">
              {getPriorityBadge(ticket.priority)}
              {ticket.is_warranty_covered && (
                <Badge variant="secondary">Warranty</Badge>
              )}
            </div>
          </div>

          <p className="text-gray-700 mb-4">{ticket.description}</p>

          <div className="space-y-2 text-sm">
            {ticket.customer_name && (
              <div>
                <span className="font-medium">Customer:</span> {ticket.customer_name}
              </div>
            )}
            {ticket.customer_phone && (
              <div>
                <span className="font-medium">Phone:</span> {ticket.customer_phone}
              </div>
            )}
            {ticket.property_address && (
              <div>
                <span className="font-medium">Address:</span> {ticket.property_address}
              </div>
            )}
            {ticket.assignments && ticket.assignments.length > 0 && (
              <div>
                <span className="font-medium">Scheduled:</span>{" "}
                {new Date(ticket.assignments[0].scheduled_date).toLocaleDateString()}
                {ticket.assignments[0].scheduled_time &&
                  ` at ${ticket.assignments[0].scheduled_time}`}
              </div>
            )}
          </div>
        </div>

        {/* Service Log Form */}
        <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Service Log
          </h3>

          <div>
            <label className="block text-sm font-medium mb-2">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about the service visit..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Work Performed</label>
            <Textarea
              value={workPerformed}
              onChange={(e) => setWorkPerformed(e.target.value)}
              placeholder="Describe the work performed..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Materials Used</label>
            <Textarea
              value={materialsUsed}
              onChange={(e) => setMaterialsUsed(e.target.value)}
              placeholder="List any materials used..."
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Resolution *</label>
            <Textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="How was the issue resolved?"
              rows={3}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Photos</label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              className="mb-2"
            />
            {photos.length > 0 && (
              <p className="text-sm text-gray-600">{photos.length} photo(s) selected</p>
            )}
          </div>

          {/* Upsell Opportunity */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="upsell"
                checked={upsellOpportunity}
                onChange={(e) => setUpsellOpportunity(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="upsell" className="font-medium">
                Upsell Opportunity
              </label>
            </div>

            {upsellOpportunity && (
              <div className="space-y-3 pl-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <Textarea
                    value={upsellDescription}
                    onChange={(e) => setUpsellDescription(e.target.value)}
                    placeholder="Describe the upsell opportunity..."
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Estimated Value</label>
                  <Input
                    type="number"
                    value={upsellValue}
                    onChange={(e) => setUpsellValue(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleCompleteService}
            disabled={!resolution || submitting}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            {submitting ? "Submitting..." : "Complete Service"}
          </Button>
        </div>
      </div>
    </div>
  );
}

























