"use client";

// Block 251700 — SmartSend Crew Issue Reporting System v1
// Issue Details Page
// app/workforce/issues/[id]/page.tsx

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, XCircle, MessageSquare, Image as ImageIcon, MapPin } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

interface Issue {
  id: string;
  issue_type: string;
  severity: string;
  title: string;
  description: string | null;
  photo_url: string | null;
  location_lat: number | null;
  location_lng: number | null;
  status: string;
  reported_at: string;
  resolved_at: string | null;
  jobs?: {
    id: string;
    job_name?: string;
    title?: string;
    address?: string;
  } | null;
  workforce_employees?: {
    id: string;
    first_name: string;
    last_name: string;
    role: string | null;
  } | null;
}

interface Comment {
  id: string;
  comment: string;
  created_at: string;
  workforce_employees?: {
    first_name: string;
    last_name: string;
  } | null;
  users?: {
    email: string;
  } | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-gray-100 text-gray-800 border-gray-300",
};

export default function IssueDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const issueId = params.id as string;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadIssue();
  }, [issueId]);

  const loadIssue = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workforce/issues/${issueId}`);
      const data = await res.json();
      setIssue(data.issue);
      setComments(data.comments || []);
    } catch (error) {
      console.error("Error loading issue:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch("/api/workforce/issues/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_id: issueId,
          status: newStatus,
        }),
      });

      const data = await res.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
        return;
      }

      setIssue(data.issue);
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/workforce/issues/${issueId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: newComment.trim(),
        }),
      });

      const data = await res.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
        return;
      }

      setNewComment("");
      loadIssue(); // Reload to get updated comments
    } catch (error) {
      console.error("Error adding comment:", error);
      alert("Failed to add comment");
    } finally {
      setSubmitting(false);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      material: "Material Shortage",
      safety: "Safety Alert",
      damage: "Damage Report",
      customer: "Customer Complaint",
      weather: "Weather Issue",
      other: "Other",
    };
    return labels[type] || type;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading issue...</div>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="p-8">
        <div className="text-center text-red-500">Issue not found</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{issue.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reported {formatDate(issue.reported_at)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Issue Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Issue Details</h2>
              <span
                className={`px-3 py-1 rounded text-sm font-semibold border ${
                  SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.low
                }`}
              >
                {issue.severity.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Type</label>
                <p className="mt-1 text-sm text-gray-900">{getTypeLabel(issue.issue_type)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <p className="mt-1 text-sm text-gray-900 capitalize">
                  {issue.status.replace("_", " ")}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Reported By</label>
                <p className="mt-1 text-sm text-gray-900">
                  {issue.workforce_employees
                    ? `${issue.workforce_employees.first_name} ${issue.workforce_employees.last_name}`
                    : "Unknown"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Job</label>
                <p className="mt-1 text-sm text-gray-900">
                  {issue.jobs?.job_name || issue.jobs?.title || "—"}
                </p>
              </div>
            </div>

            {issue.description && (
              <div>
                <label className="text-sm font-medium text-gray-500">Description</label>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {issue.description}
                </p>
              </div>
            )}

            {issue.photo_url && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Photo
                </label>
                <div className="mt-2">
                  <img
                    src={issue.photo_url}
                    alt="Issue photo"
                    className="max-w-full h-auto rounded-lg border border-gray-200"
                  />
                </div>
              </div>
            )}

            {issue.location_lat && issue.location_lng && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Location
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  {issue.location_lat.toFixed(6)}, {issue.location_lng.toFixed(6)}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${issue.location_lat},${issue.location_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                >
                  View on Google Maps
                </a>
              </div>
            )}
          </div>

          {/* Comments Timeline */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Comments
            </h2>

            <div className="space-y-4 mb-6">
              {comments.map((comment) => (
                <div key={comment.id} className="border-l-2 border-gray-200 pl-4 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      {comment.workforce_employees
                        ? `${comment.workforce_employees.first_name} ${comment.workforce_employees.last_name}`
                        : comment.users?.email || "Unknown"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{comment.comment}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-sm text-gray-500">No comments yet</p>
              )}
            </div>

            {/* Add Comment Form */}
            <form onSubmit={handleAddComment} className="space-y-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Adding..." : "Add Comment"}
              </button>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Status</h3>
            <div className="space-y-2">
              <select
                value={issue.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={updating}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={() => handleStatusChange("resolved")}
                disabled={updating || issue.status === "resolved"}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Resolved
              </button>
              <button
                onClick={() => handleStatusChange("dismissed")}
                disabled={updating || issue.status === "dismissed"}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle className="w-4 h-4" />
                Dismiss Issue
              </button>
            </div>

            {issue.resolved_at && (
              <p className="mt-4 text-xs text-gray-500">
                Resolved: {formatDate(issue.resolved_at)}
              </p>
            )}
          </div>

          {/* Job Info */}
          {issue.jobs && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Job Information</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Job:</span>{" "}
                  <span className="text-gray-900">
                    {issue.jobs.job_name || issue.jobs.title || "—"}
                  </span>
                </div>
                {issue.jobs.address && (
                  <div>
                    <span className="text-gray-500">Address:</span>{" "}
                    <span className="text-gray-900">{issue.jobs.address}</span>
                  </div>
                )}
                <a
                  href={`/jobs/${issue.jobs.id}`}
                  className="text-blue-600 hover:underline text-sm"
                >
                  View Job →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
























