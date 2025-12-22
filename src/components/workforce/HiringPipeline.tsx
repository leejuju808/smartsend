"use client";

import { useState, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import { WorkforceApplicant } from "@/types/database";

export function HiringPipeline() {
  const [applicants, setApplicants] = useState<WorkforceApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("new");

  useEffect(() => {
    fetchApplicants();
  }, [statusFilter]);

  async function fetchApplicants() {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);

      const res = await fetch(`/api/workforce/applicants?${params}`);
      const data = await res.json();
      setApplicants(data.applicants || []);
    } catch (error) {
      console.error("Error fetching applicants:", error);
    } finally {
      setLoading(false);
    }
  }

  async function updateApplicantStatus(id: string, newStatus: string) {
    try {
      await fetch(`/api/workforce/applicants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchApplicants();
    } catch (error) {
      console.error("Error updating applicant:", error);
    }
  }

  const statusColumns = [
    { id: "new", label: "New", color: "bg-blue-50 border-blue-200" },
    { id: "review", label: "Review", color: "bg-yellow-50 border-yellow-200" },
    { id: "interview", label: "Interview", color: "bg-orange-50 border-orange-200" },
    { id: "hired", label: "Hired", color: "bg-green-50 border-green-200" },
    { id: "rejected", label: "Rejected", color: "bg-red-50 border-red-200" },
  ];

  if (loading) {
    return <div className="text-center py-12">Loading applicants...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Hiring Pipeline</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Add Applicant
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-5 gap-4">
        {statusColumns.map((column) => {
          const columnApplicants = applicants.filter(
            (app) => app.status === column.id
          );
          return (
            <div
              key={column.id}
              className={`rounded-lg border-2 p-4 ${column.color} min-h-[400px]`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{column.label}</h3>
                <span className="text-sm text-gray-600">
                  {columnApplicants.length}
                </span>
              </div>
              <div className="space-y-3">
                {columnApplicants.map((applicant) => (
                  <div
                    key={applicant.id}
                    className="bg-white rounded-lg p-3 shadow-sm border"
                  >
                    <div className="font-medium text-sm">
                      {applicant.first_name} {applicant.last_name}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {applicant.position_applied}
                    </div>
                    {applicant.email && (
                      <div className="text-xs text-gray-500 mt-1">
                        {applicant.email}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      {column.id !== "hired" && column.id !== "rejected" && (
                        <>
                          {column.id === "new" && (
                            <button
                              onClick={() =>
                                updateApplicantStatus(applicant.id, "review")
                              }
                              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              Review
                            </button>
                          )}
                          {column.id === "review" && (
                            <>
                              <button
                                onClick={() =>
                                  updateApplicantStatus(applicant.id, "interview")
                                }
                                className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                              >
                                Interview
                              </button>
                              <button
                                onClick={() =>
                                  updateApplicantStatus(applicant.id, "rejected")
                                }
                                className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {column.id === "interview" && (
                            <>
                              <button
                                onClick={() =>
                                  updateApplicantStatus(applicant.id, "hired")
                                }
                                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                Hire
                              </button>
                              <button
                                onClick={() =>
                                  updateApplicantStatus(applicant.id, "rejected")
                                }
                                className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
























