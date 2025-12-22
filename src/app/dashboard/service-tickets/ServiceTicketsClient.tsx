"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ServiceTicket {
  id: string;
  lead_id: string | null;
  job_id: string | null;
  issue_type: string;
  urgency: string;
  description: string;
  status: string;
  covered: boolean | null;
  warranty_determination: string;
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
}

export default function ServiceTicketsClient() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "all",
    urgency: "all",
    covered: "all",
    issue_type: "all",
  });

  useEffect(() => {
    loadTickets();
  }, [filters]);

  async function loadTickets() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status !== "all") params.append("status", filters.status);
      if (filters.urgency !== "all") params.append("urgency", filters.urgency);
      if (filters.covered !== "all") params.append("covered", filters.covered);
      if (filters.issue_type !== "all") params.append("issue_type", filters.issue_type);

      const workspaceId = localStorage.getItem("workspace_id") || 
        new URLSearchParams(window.location.search).get("wid");
      
      const response = await fetch(
        `/api/service-tickets?${params.toString()}`,
        {
          headers: {
            "x-workspace-id": workspaceId || "",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load tickets");
      }

      const data = await response.json();
      setTickets(data.tickets || []);
    } catch (error) {
      console.error("Error loading tickets:", error);
    } finally {
      setLoading(false);
    }
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "emergency":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800";
      case "scheduled":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-purple-100 text-purple-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading service tickets...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Service & Warranty Tickets</h1>
        <p className="text-gray-600">
          Manage warranty requests, service calls, and repair scheduling
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Urgency
            </label>
            <select
              value={filters.urgency}
              onChange={(e) => setFilters({ ...filters, urgency: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="all">All</option>
              <option value="emergency">Emergency</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Warranty
            </label>
            <select
              value={filters.covered}
              onChange={(e) => setFilters({ ...filters, covered: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="all">All</option>
              <option value="true">Covered</option>
              <option value="false">Not Covered</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Issue Type
            </label>
            <select
              value={filters.issue_type}
              onChange={(e) => setFilters({ ...filters, issue_type: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="all">All</option>
              <option value="leak">Leak</option>
              <option value="shingle_loss">Shingle Loss</option>
              <option value="vent_issue">Vent Issue</option>
              <option value="flashing">Flashing</option>
              <option value="gutter">Gutter</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Issue
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Homeowner
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Urgency
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Covered?
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No service tickets found
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/dashboard/service-tickets/${ticket.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {ticket.issue_type || "Unknown"}
                    </Link>
                    <div className="text-sm text-gray-500 truncate max-w-xs">
                      {ticket.description.substring(0, 100)}
                      {ticket.description.length > 100 ? "..." : ""}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {ticket.leads ? (
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {ticket.leads.first_name} {ticket.leads.last_name}
                        </div>
                        <div className="text-sm text-gray-500">{ticket.leads.email}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">No lead</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getUrgencyColor(
                        ticket.urgency
                      )}`}
                    >
                      {ticket.urgency}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                        ticket.status
                      )}`}
                    >
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {ticket.covered === true ? (
                      <span className="text-green-600">Yes</span>
                    ) : ticket.covered === false ? (
                      <span className="text-red-600">No</span>
                    ) : (
                      <span className="text-gray-400">Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
































