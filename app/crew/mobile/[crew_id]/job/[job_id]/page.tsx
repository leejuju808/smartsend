"use client";

// Block 27880 — SmartSend Roofing Crew Mobile Field App v1
// Mobile page: Job Detail View
// app/crew/mobile/[crew_id]/job/[job_id]/page.tsx

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Circle, Camera, AlertTriangle, Package, ArrowLeft } from "lucide-react";

interface Job {
  id: string;
  job_name?: string | null;
  title?: string | null;
  address?: string | null;
  notes?: string | null;
}

interface Material {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  is_ordered?: boolean;
}

interface Step {
  id: string;
  step: string;
  completed: boolean;
  completed_at?: string | null;
}

const STEP_ORDER = ["arrived", "tear_off", "dry_in", "install", "clean_up", "completed"];

export default function CrewJob() {
  const params = useParams();
  const router = useRouter();
  const { crew_id, job_id } = params as { crew_id: string; job_id: string };
  
  const [job, setJob] = useState<Job | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("during");

  useEffect(() => {
    if (!job_id) return;

    // Fetch job details
    fetch(`/api/job/${job_id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          console.error("Error fetching job:", d.error);
        } else {
          setJob(d.job);
        }
      })
      .catch((err) => console.error("Error:", err));

    // Fetch materials
    fetch(`/api/job/${job_id}/materials`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          console.error("Error fetching materials:", d.error);
        } else {
          setMaterials(d.items || []);
        }
      })
      .catch((err) => console.error("Error:", err));

    // Fetch steps
    fetch(`/api/job/${job_id}/steps`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          console.error("Error fetching steps:", d.error);
        } else {
          setSteps(d.steps || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error:", err);
        setLoading(false);
      });
  }, [job_id]);

  const handleStepClick = async (step: string) => {
    try {
      const response = await fetch("/api/crew/job-step", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ job_id, crew_id, step }),
      });

      const data = await response.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
        return;
      }

      // Refresh steps
      const stepsRes = await fetch(`/api/job/${job_id}/steps`);
      const stepsData = await stepsRes.json();
      if (stepsData.steps) {
        setSteps(stepsData.steps);
      }
    } catch (error) {
      console.error("Error marking step:", error);
      alert("Failed to mark step as complete");
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoUploading(true);

    try {
      // Create form data
      const formData = new FormData();
      formData.append("file", file);
      formData.append("job_id", job_id);
      formData.append("crew_id", crew_id);
      formData.append("category", selectedCategory);

      // Upload file
      const res = await fetch("/api/crew/upload-photo", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
      } else {
        alert("Photo uploaded successfully!");
      }
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("Failed to upload photo");
    } finally {
      setPhotoUploading(false);
      // Reset file input
      e.target.value = "";
    }
  };

  const handleReportIssue = async () => {
    const description = prompt("Describe the issue:");
    if (!description) return;

    try {
      const response = await fetch("/api/crew/report-issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id,
          crew_id,
          issue_type: "general",
          description,
        }),
      });

      const data = await response.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
      } else {
        alert("Issue reported successfully!");
      }
    } catch (error) {
      console.error("Error reporting issue:", error);
      alert("Failed to report issue");
    }
  };

  const isStepCompleted = (step: string) => {
    return steps.some((s) => s.step === step && s.completed);
  };

  const getStepLabel = (step: string) => {
    return step
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="text-center py-8">
          <div className="text-gray-500">Loading job details...</div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="text-center py-8">
          <div className="text-red-500">Job not found</div>
        </div>
      </div>
    );
  }

  const jobName = job.title || "Untitled Job";

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.push(`/crew/mobile/${crew_id}/jobs`)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{jobName}</h1>
            {job.address && (
              <div className="text-sm text-gray-500 mt-1">{job.address}</div>
            )}
          </div>
        </div>

        {/* Job Steps */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold mb-3 text-gray-900">Job Steps</h2>
          <div className="space-y-2">
            {STEP_ORDER.map((step) => {
              const completed = isStepCompleted(step);
              return (
                <button
                  key={step}
                  onClick={() => handleStepClick(step)}
                  className={`w-full flex items-center gap-3 py-3 px-4 rounded-lg border-2 transition-colors ${
                    completed
                      ? "bg-green-50 border-green-500 text-green-900"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {completed ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                  <span className="flex-1 text-left font-medium">
                    Mark {getStepLabel(step)} Complete
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Material List */}
        {materials.length > 0 && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold mb-3 text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Materials
            </h2>
            <ul className="space-y-2">
              {materials.map((m) => (
                <li
                  key={m.id}
                  className="border border-gray-200 rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{m.description}</div>
                    <div className="text-sm text-gray-500">
                      {m.quantity} {m.unit}
                    </div>
                  </div>
                  {m.is_ordered !== undefined && (
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        m.is_ordered
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {m.is_ordered ? "Ordered" : "Pending"}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Photo Upload */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold mb-3 text-gray-900 flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Upload Photo
          </h2>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="before">Before</option>
              <option value="during">During</option>
              <option value="after">After</option>
              <option value="material_issue">Material Issue</option>
              <option value="rot">Rot/Decking</option>
              <option value="other">Other</option>
            </select>
          </div>

          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            disabled={photoUploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
          {photoUploading && (
            <div className="text-xs text-gray-500 mt-2">Uploading...</div>
          )}
        </div>

        {/* Report Issue */}
        <button
          onClick={handleReportIssue}
          className="w-full bg-red-600 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-red-700 transition-colors shadow-sm"
        >
          <AlertTriangle className="w-5 h-5" />
          Report Issue
        </button>

        {/* Notes */}
        {job.notes && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold mb-2 text-gray-900">Notes</h2>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {job.notes}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



































