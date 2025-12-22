"use client";

// Block 251800 — SmartSend Material Verification System v1
// Office Materials Dashboard

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Download,
  Eye,
  RefreshCw,
} from "lucide-react";

interface JobMaterialSummary {
  job_id: string;
  job_title?: string;
  supplier?: string;
  total_items: number;
  matched_items: number;
  shortages: number;
  wrong_materials: number;
  health_percentage: number;
  risk_score: number;
  status: "complete" | "shortages" | "wrong_materials" | "pending";
}

interface MaterialDetail {
  job_id: string;
  items: any[];
  deliveries: any[];
  verifications: any[];
  approval: any;
  summary: {
    total_items: number;
    matched_items: number;
    shortages: number;
    wrong_materials: number;
    health_percentage: number;
    risk_score: number;
  };
}

export default function MaterialsDashboardPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobMaterialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<MaterialDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDrawer, setShowDrawer] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    setLoading(true);
    try {
      // In a real implementation, you'd fetch jobs with material data
      // For now, we'll create a placeholder that can be extended
      // This would typically come from a jobs API that includes material status
      const response = await fetch("/api/jobs?include_materials=true");
      if (response.ok) {
        const data = await response.json();
        // Transform data to include material summaries
        // This is a placeholder - adjust based on your jobs API structure
        setJobs([]);
      }
    } catch (error) {
      console.error("Error loading jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadJobDetails = async (jobId: string) => {
    try {
      const response = await fetch(`/api/materials/job/${jobId}`);
      const data = await response.json();
      setJobDetails(data);
      setShowDrawer(true);
    } catch (error) {
      console.error("Error loading job details:", error);
    }
  };

  const handleApprove = async (jobId: string) => {
    try {
      const response = await fetch("/api/materials/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          status: "approved",
        }),
      });

      if (response.ok) {
        alert("Material verification approved");
        loadJobs();
        setShowDrawer(false);
      }
    } catch (error) {
      console.error("Error approving:", error);
      alert("Failed to approve");
    }
  };

  const handleRequestReverification = async (jobId: string) => {
    try {
      const response = await fetch("/api/materials/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          status: "needs_reverification",
        }),
      });

      if (response.ok) {
        alert("Re-verification requested");
        loadJobs();
        setShowDrawer(false);
      }
    } catch (error) {
      console.error("Error requesting re-verification:", error);
      alert("Failed to request re-verification");
    }
  };

  const handleGenerateDisputePackage = async (jobId: string) => {
    try {
      const response = await fetch(`/api/materials/dispute-package/${jobId}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Job-${jobId}-Supplier-Dispute-Packet.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error generating dispute package:", error);
      alert("Failed to generate dispute package");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "complete":
        return <CheckCircle className="text-green-600" size={20} />;
      case "shortages":
        return <AlertTriangle className="text-orange-600" size={20} />;
      case "wrong_materials":
        return <XCircle className="text-red-600" size={20} />;
      case "pending":
        return <Clock className="text-gray-600" size={20} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "complete":
        return "bg-green-50 border-green-200";
      case "shortages":
        return "bg-orange-50 border-orange-200";
      case "wrong_materials":
        return "bg-red-50 border-red-200";
      case "pending":
        return "bg-gray-50 border-gray-200";
      default:
        return "bg-white border-gray-200";
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter === "all") return true;
    return job.status === statusFilter;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Material Verification</h1>
          <p className="text-sm text-gray-600 mt-1">
            Track delivery proof, shortages, and supplier disputes
          </p>
        </div>
        <button
          onClick={loadJobs}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            statusFilter === "all"
              ? "bg-orange-600 text-white"
              : "bg-white text-gray-700 border border-gray-300"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setStatusFilter("complete")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            statusFilter === "complete"
              ? "bg-green-600 text-white"
              : "bg-white text-gray-700 border border-gray-300"
          }`}
        >
          Complete
        </button>
        <button
          onClick={() => setStatusFilter("shortages")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            statusFilter === "shortages"
              ? "bg-orange-600 text-white"
              : "bg-white text-gray-700 border border-gray-300"
          }`}
        >
          Shortages
        </button>
        <button
          onClick={() => setStatusFilter("wrong_materials")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            statusFilter === "wrong_materials"
              ? "bg-red-600 text-white"
              : "bg-white text-gray-700 border border-gray-300"
          }`}
        >
          Wrong Materials
        </button>
        <button
          onClick={() => setStatusFilter("pending")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            statusFilter === "pending"
              ? "bg-gray-600 text-white"
              : "bg-white text-gray-700 border border-gray-300"
          }`}
        >
          Pending
        </button>
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading materials...</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-600">No jobs with material data found.</p>
          <p className="text-sm text-gray-500 mt-2">
            Material verification will appear here once crews start verifying deliveries.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <div
              key={job.job_id}
              className={`bg-white border-2 rounded-lg p-6 ${getStatusColor(job.status)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(job.status)}
                    <h3 className="text-lg font-semibold text-gray-900">
                      Job #{job.job_id.slice(0, 8)}
                    </h3>
                    {job.supplier && (
                      <span className="text-sm text-gray-600">• {job.supplier}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-gray-500">Material Health</p>
                      <p className="text-lg font-semibold">{job.health_percentage}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Risk Score</p>
                      <p className="text-lg font-semibold">{job.risk_score}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Shortages</p>
                      <p className="text-lg font-semibold text-orange-600">
                        {job.shortages}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Wrong Materials</p>
                      <p className="text-lg font-semibold text-red-600">
                        {job.wrong_materials}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 text-sm text-gray-600">
                    <p>
                      {job.matched_items} of {job.total_items} items verified
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => loadJobDetails(job.job_id)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  {(job.shortages > 0 || job.wrong_materials > 0) && (
                    <button
                      onClick={() => handleGenerateDisputePackage(job.job_id)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      {showDrawer && jobDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
          <div className="bg-white w-full max-w-4xl h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Material Details</h2>
              <button
                onClick={() => setShowDrawer(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Health</p>
                    <p className="text-2xl font-bold">{jobDetails.summary.health_percentage}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Risk Score</p>
                    <p className="text-2xl font-bold">{jobDetails.summary.risk_score}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Shortages</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {jobDetails.summary.shortages}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Wrong Materials</p>
                    <p className="text-2xl font-bold text-red-600">
                      {jobDetails.summary.wrong_materials}
                    </p>
                  </div>
                </div>
              </div>

              {/* Delivery Photos */}
              {jobDetails.deliveries.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Delivery Photos</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {jobDetails.deliveries.map((delivery) => (
                      <div key={delivery.id}>
                        {delivery.photo_url && (
                          <img
                            src={delivery.photo_url}
                            alt="Delivery photo"
                            className="w-full h-48 object-cover rounded-lg"
                          />
                        )}
                        <p className="text-sm text-gray-600 mt-2">
                          {delivery.supplier} • {new Date(delivery.delivered_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Material Items & Verification */}
              <div>
                <h3 className="font-semibold mb-3">Material Items</h3>
                <div className="space-y-3">
                  {jobDetails.items.map((item) => {
                    const verification = jobDetails.verifications.find(
                      (v) => v.material_item_id === item.id
                    );

                    return (
                      <div
                        key={item.id}
                        className={`border-2 rounded-lg p-4 ${
                          verification?.status === "matched"
                            ? "bg-green-50 border-green-200"
                            : verification?.status === "shortage"
                            ? "bg-orange-50 border-orange-200"
                            : verification?.status === "wrong_material"
                            ? "bg-red-50 border-red-200"
                            : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold">{item.name}</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              Expected: {item.quantity_expected} {item.unit || "units"}
                            </p>
                            {verification && (
                              <p className="text-sm text-gray-600">
                                Found: {verification.quantity_found} {item.unit || "units"}
                              </p>
                            )}
                          </div>
                          <div className="ml-4">
                            {verification?.status === "matched" && (
                              <CheckCircle className="text-green-600" size={24} />
                            )}
                            {verification?.status === "shortage" && (
                              <AlertTriangle className="text-orange-600" size={24} />
                            )}
                            {verification?.status === "wrong_material" && (
                              <XCircle className="text-red-600" size={24} />
                            )}
                            {!verification && <Clock className="text-gray-400" size={24} />}
                          </div>
                        </div>
                        {verification?.photo_url && (
                          <img
                            src={verification.photo_url}
                            alt="Verification photo"
                            className="w-full h-32 object-cover rounded-lg mt-3"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleApprove(jobDetails.job_id)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleRequestReverification(jobDetails.job_id)}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
                >
                  Request Re-verification
                </button>
                {(jobDetails.summary.shortages > 0 ||
                  jobDetails.summary.wrong_materials > 0) && (
                  <button
                    onClick={() => handleGenerateDisputePackage(jobDetails.job_id)}
                    className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4 inline mr-2" />
                    Dispute Package
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
























