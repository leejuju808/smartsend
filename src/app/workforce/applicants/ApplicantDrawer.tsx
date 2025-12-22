"use client";

import { useState } from "react";
import { X, FileText, Mail, Phone, User, Briefcase, Calendar, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { WorkforceApplicant } from "@/types/database";

interface ApplicantDrawerProps {
  applicant: WorkforceApplicant;
  onClose: () => void;
  onUpdate: () => void;
}

export function ApplicantDrawer({ applicant, onClose, onUpdate }: ApplicantDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  const [role, setRole] = useState<string>("");
  const [skillLevel, setSkillLevel] = useState<string>("apprentice");

  async function handleStatusChange(newStatus: string) {
    try {
      setLoading(true);
      await fetch("/api/workforce/applicants/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: applicant.id, status: newStatus }),
      });
      onUpdate();
      if (newStatus === "hired" || newStatus === "rejected") {
        onClose();
      }
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status");
    } finally {
      setLoading(false);
    }
  }

  async function handleHire() {
    try {
      setLoading(true);
      const res = await fetch("/api/workforce/applicants/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: applicant.id,
          role: role || undefined,
          skill_level: skillLevel,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to hire applicant");
      }

      onUpdate();
      onClose();
      alert("Applicant converted to employee successfully!");
    } catch (error: any) {
      console.error("Error hiring applicant:", error);
      alert(error.message || "Failed to hire applicant");
    } finally {
      setLoading(false);
      setShowHireModal(false);
    }
  }

  const statusColors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    review: "bg-yellow-100 text-yellow-800",
    interview: "bg-orange-100 text-orange-800",
    hired: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Applicant Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Name & Status */}
          <div>
            <h3 className="text-2xl font-bold text-gray-900">
              {applicant.first_name} {applicant.last_name}
            </h3>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                  statusColors[applicant.status] || statusColors.new
                }`}
              >
                {applicant.status}
              </span>
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Contact Information
            </h4>
            <div className="space-y-2">
              {applicant.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <a
                    href={`mailto:${applicant.email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {applicant.email}
                  </a>
                </div>
              )}
              {applicant.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <a
                    href={`tel:${applicant.phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {applicant.phone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Position Applied */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Position Applied
            </h4>
            <div className="flex items-center gap-2 text-gray-900">
              <Briefcase className="h-4 w-4 text-gray-400" />
              <span>{applicant.position_applied}</span>
            </div>
          </div>

          {/* Resume */}
          {applicant.resume_url && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Resume
              </h4>
              <a
                href={applicant.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm"
              >
                <FileText className="h-4 w-4" />
                <span>View Resume</span>
              </a>
            </div>
          )}

          {/* Notes */}
          {applicant.notes && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Notes
              </h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{applicant.notes}</p>
            </div>
          )}

          {/* Created Date */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Applied
            </h4>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span>
                {new Date(applicant.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-6 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Actions
            </h4>
            <div className="space-y-2">
              {applicant.status === "new" && (
                <button
                  onClick={() => handleStatusChange("review")}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Move to Review
                </button>
              )}
              {applicant.status === "review" && (
                <>
                  <button
                    onClick={() => handleStatusChange("interview")}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-orange-100 text-orange-800 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    Move to Interview
                  </button>
                  <button
                    onClick={() => handleStatusChange("rejected")}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
              {applicant.status === "interview" && (
                <>
                  <button
                    onClick={() => setShowHireModal(true)}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Hire (Convert to Employee)
                  </button>
                  <button
                    onClick={() => handleStatusChange("rejected")}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hire Modal */}
      {showHireModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Convert to Employee
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Auto-detect from position</option>
                  <option value="laborer">Laborer</option>
                  <option value="installer">Installer</option>
                  <option value="foreman">Foreman</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="estimator">Estimator</option>
                  <option value="sales">Sales</option>
                  <option value="office">Office</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Skill Level
                </label>
                <select
                  value={skillLevel}
                  onChange={(e) => setSkillLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="apprentice">Apprentice</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowHireModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleHire}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Hiring..." : "Hire"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
























