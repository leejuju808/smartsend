"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ServiceTicketDetail {
  ticket: {
    id: string;
    lead_id: string | null;
    job_id: string | null;
    issue_type: string;
    urgency: string;
    description: string;
    status: string;
    covered: boolean | null;
    warranty_determination: string;
    recommended_action: string | null;
    scheduled_at: string | null;
    resolved_at: string | null;
    created_at: string;
    leads: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      phone: string | null;
    } | null;
    jobs: {
      id: string;
      stage: string;
      contract_value: number | null;
    } | null;
  };
  photos: Array<{
    id: string;
    photo_url: string;
    label: string | null;
    ai_analysis: string | null;
    created_at: string;
  }>;
  events: Array<{
    id: string;
    event: string;
    metadata: any;
    created_at: string;
  }>;
}

export default function ServiceTicketDetailClient({
  ticketId,
}: {
  ticketId: string;
}) {
  const [data, setData] = useState<ServiceTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTicket();
  }, [ticketId]);

  async function loadTicket() {
    setLoading(true);
    try {
      const workspaceId = localStorage.getItem("workspace_id") || 
        new URLSearchParams(window.location.search).get("wid");
      
      const response = await fetch(`/api/service-tickets/${ticketId}`, {
        headers: {
          "x-workspace-id": workspaceId || "",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load ticket");
      }

      const ticketData = await response.json();
      setData(ticketData);
    } catch (error) {
      console.error("Error loading ticket:", error);
    } finally {
      setLoading(false);
    }
  }

  async function requestPhotos() {
    try {
      const workspaceId = localStorage.getItem("workspace_id") || 
        new URLSearchParams(window.location.search).get("wid");
      
      const response = await fetch(`/api/service-tickets/${ticketId}/request-photos`, {
        method: "POST",
        headers: {
          "x-workspace-id": workspaceId || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        alert("Photo request sent to homeowner!");
        loadTicket();
      } else {
        alert("Failed to send photo request");
      }
    } catch (error) {
      console.error("Error requesting photos:", error);
      alert("Failed to send photo request");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading ticket...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Ticket not found</div>
      </div>
    );
  }

  const { ticket, photos, events } = data;

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/dashboard/service-tickets"
          className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          ← Back to Tickets
        </Link>
        <h1 className="text-2xl font-bold">Service Ticket #{ticket.id.substring(0, 8)}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ticket Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Issue Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Issue Type</label>
                <div className="mt-1">{ticket.issue_type || "Unknown"}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Urgency</label>
                <div className="mt-1">
                  <span className={`px-2 py-1 rounded-full text-sm ${
                    ticket.urgency === "emergency" ? "bg-red-100 text-red-800" :
                    ticket.urgency === "high" ? "bg-orange-100 text-orange-800" :
                    "bg-gray-100 text-gray-800"
                  }`}>
                    {ticket.urgency}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Description</label>
                <div className="mt-1 text-gray-900">{ticket.description}</div>
              </div>
              {ticket.recommended_action && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Recommended Action</label>
                  <div className="mt-1 text-gray-900">{ticket.recommended_action}</div>
                </div>
              )}
            </div>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Photos</h2>
              <button
                onClick={requestPhotos}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Request Photos
              </button>
            </div>
            {photos.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No photos yet. Request photos from the homeowner.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="border rounded-lg p-2">
                    <img
                      src={photo.photo_url}
                      alt={photo.label || "Service photo"}
                      className="w-full h-48 object-cover rounded"
                    />
                    {photo.label && (
                      <div className="mt-2 text-sm text-gray-600">{photo.label}</div>
                    )}
                    {photo.ai_analysis && (
                      <div className="mt-2 text-xs text-gray-500">{photo.ai_analysis}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Events Timeline */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Event Timeline</h2>
            <div className="space-y-4">
              {events.map((event) => (
                <div key={event.id} className="border-l-2 border-gray-200 pl-4">
                  <div className="text-sm font-medium">{event.event}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(event.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Status</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Current Status</label>
                <div className="mt-1">
                  <span className={`px-2 py-1 rounded-full text-sm ${
                    ticket.status === "open" ? "bg-blue-100 text-blue-800" :
                    ticket.status === "scheduled" ? "bg-yellow-100 text-yellow-800" :
                    ticket.status === "in_progress" ? "bg-purple-100 text-purple-800" :
                    ticket.status === "resolved" ? "bg-green-100 text-green-800" :
                    "bg-gray-100 text-gray-800"
                  }`}>
                    {ticket.status}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Warranty Coverage</label>
                <div className="mt-1">
                  {ticket.covered === true ? (
                    <span className="text-green-600">Covered</span>
                  ) : ticket.covered === false ? (
                    <span className="text-red-600">Not Covered</span>
                  ) : (
                    <span className="text-gray-400">Pending</span>
                  )}
                </div>
              </div>
              {ticket.scheduled_at && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Scheduled</label>
                  <div className="mt-1">
                    {new Date(ticket.scheduled_at).toLocaleString()}
                  </div>
                </div>
              )}
              {ticket.resolved_at && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Resolved</label>
                  <div className="mt-1">
                    {new Date(ticket.resolved_at).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Homeowner Info */}
          {ticket.leads && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Homeowner</h2>
              <div className="space-y-2">
                <div>
                  <div className="font-medium">
                    {ticket.leads.first_name} {ticket.leads.last_name}
                  </div>
                  <div className="text-sm text-gray-500">{ticket.leads.email}</div>
                  {ticket.leads.phone && (
                    <div className="text-sm text-gray-500">{ticket.leads.phone}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Job Info */}
          {ticket.jobs && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Related Job</h2>
              <div className="space-y-2">
                <Link
                  href={`/dashboard/jobs/${ticket.jobs.id}`}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Job #{ticket.jobs.id.substring(0, 8)}
                </Link>
                <div className="text-sm text-gray-500">Stage: {ticket.jobs.stage}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
































