"use client";

// Block 50000 — SmartSend Roofing QC Inspection System v1
// Homeowner QC Verification Component
// Displays QC results and allows homeowner to verify/approve

import { useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Camera, FileCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QCVerificationProps {
  jobId: string;
  token: string;
  qcInspection: {
    id: string;
    score: number;
    status: string;
    pass_threshold: number;
    checklist: Array<{
      key: string;
      label: string;
      status: string;
    }>;
    photos: Array<{
      id: string;
      checklist_item: string;
      url: string;
    }>;
  } | null;
  existingVerification: {
    status: string;
    feedback?: string;
  } | null;
  onVerified?: () => void;
}

export function QCVerification({
  jobId,
  token,
  qcInspection: initialQcInspection,
  existingVerification: initialExistingVerification,
  onVerified,
}: QCVerificationProps) {
  const [qcInspection, setQcInspection] = useState(initialQcInspection);
  const [existingVerification, setExistingVerification] = useState(initialExistingVerification);
  const [loading, setLoading] = useState(!initialQcInspection);
  
  const [status, setStatus] = useState<"approved" | "needs_attention" | null>(
    initialExistingVerification?.status === "approved" || initialExistingVerification?.status === "needs_attention"
      ? initialExistingVerification.status
      : null
  );
  const [feedback, setFeedback] = useState(initialExistingVerification?.feedback || "");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!initialExistingVerification);

  // Fetch QC inspection data if not provided
  useEffect(() => {
    if (!initialQcInspection && jobId) {
      const fetchQCData = async () => {
        try {
          // Fetch QC inspection for this job
          const qcResponse = await fetch(`/api/qc/inspections?job_id=${jobId}`);
          if (qcResponse.ok) {
            const qcData = await qcResponse.json();
            const completedInspection = qcData.inspections?.find((i: any) => i.status === "completed");
            if (completedInspection) {
              setQcInspection(completedInspection);
              
              // Fetch existing verification
              const verifyResponse = await fetch(`/api/qc/homeowner-verify?job_id=${jobId}`);
              if (verifyResponse.ok) {
                const verifyData = await verifyResponse.json();
                if (verifyData.verification) {
                  setExistingVerification(verifyData.verification);
                  setStatus(verifyData.verification.status);
                  setFeedback(verifyData.verification.feedback || "");
                  setSubmitted(true);
                }
              }
            }
          }
        } catch (error) {
          console.error("Error fetching QC data:", error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchQCData();
    }
  }, [jobId, initialQcInspection]);

  // Don't show if loading or QC inspection not completed
  if (loading) {
    return null;
  }

  if (!qcInspection || qcInspection.status !== "completed") {
    return null;
  }

  const handleVerify = async (verificationStatus: "approved" | "needs_attention") => {
    setSubmitting(true);

    try {
      const response = await fetch("/api/qc/homeowner-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          qc_inspection_id: qcInspection.id,
          status: verificationStatus,
          feedback: feedback || null,
          portal_token: token,
        }),
      });

      if (response.ok) {
        setStatus(verificationStatus);
        setSubmitted(true);
        if (onVerified) {
          onVerified();
        }
      } else {
        alert("Failed to submit verification. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting verification:", error);
      alert("Failed to submit verification. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const scoreColor = qcInspection.score >= qcInspection.pass_threshold 
    ? "text-green-500" 
    : "text-yellow-500";

  const passedItems = qcInspection.checklist.filter(item => item.status === "pass").length;
  const totalItems = qcInspection.checklist.length;

  return (
    <Card className="border-yellow-500/20 bg-yellow-500/5">
      <CardHeader>
        <div className="flex items-center gap-3">
          <FileCheck className="w-6 h-6 text-yellow-500" />
          <CardTitle>Quality Control Verification</CardTitle>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Your roof installation has been inspected. Please review and verify completion.
        </p>
      </CardHeader>
      <CardContent>
        {/* QC Score Summary */}
        <div className="bg-gray-900 rounded-lg p-4 mb-4 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-gray-400 mb-1">QC Inspection Score</p>
              <p className={`text-3xl font-bold ${scoreColor}`}>
                {qcInspection.score.toFixed(1)} / 100
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400 mb-1">Items Passed</p>
              <p className="text-2xl font-bold">
                {passedItems} / {totalItems}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-800">
            <p className="text-sm text-gray-400">
              {qcInspection.score >= qcInspection.pass_threshold 
                ? "✅ Your roof has passed quality control inspection."
                : "⚠️ Some items need attention before final approval."}
            </p>
          </div>
        </div>

        {/* QC Checklist Summary */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2 text-gray-300">Inspection Checklist</h3>
          <div className="space-y-2">
            {qcInspection.checklist.slice(0, 5).map((item) => (
              <div 
                key={item.key}
                className="flex items-center gap-2 text-sm bg-gray-900 rounded p-2"
              >
                {item.status === "pass" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className={item.status === "pass" ? "text-gray-300" : "text-red-400"}>
                  {item.label}
                </span>
              </div>
            ))}
            {qcInspection.checklist.length > 5 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                +{qcInspection.checklist.length - 5} more items
              </p>
            )}
          </div>
        </div>

        {/* QC Photos */}
        {qcInspection.photos && qcInspection.photos.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2 text-gray-300 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              QC Photos
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {qcInspection.photos.slice(0, 6).map((photo) => (
                <img
                  key={photo.id}
                  src={photo.url}
                  alt={photo.checklist_item}
                  className="w-full h-24 object-cover rounded border border-gray-700"
                />
              ))}
            </div>
          </div>
        )}

        {/* Verification Form */}
        {!submitted ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">
                Additional Feedback (Optional)
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Any concerns or comments about the installation..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-white placeholder-gray-500"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleVerify("approved")}
                disabled={submitting}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Everything Looks Good
                  </>
                )}
              </button>
              <button
                onClick={() => handleVerify("needs_attention")}
                disabled={submitting}
                className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5" />
                    Needs Attention
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-500 mb-2">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold">
                {status === "approved" 
                  ? "Thank you! Your verification has been submitted."
                  : "Your concerns have been submitted. We'll address them promptly."}
              </span>
            </div>
            {feedback && (
              <p className="text-sm text-gray-400 mt-2">{feedback}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

