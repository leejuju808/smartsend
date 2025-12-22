"use client";

// Block 251800 — SmartSend Material Verification System v1
// Crew Material Verification Checklist Page

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Camera, Check, AlertTriangle, X } from "lucide-react";

interface MaterialItem {
  id: string;
  name: string;
  quantity_expected: number;
  unit: string;
}

interface Verification {
  id?: string;
  material_item_id: string;
  quantity_found: number | null;
  status: string;
  photo_url: string | null;
}

export default function MaterialVerificationPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.jobId as string;

  const [items, setItems] = useState<MaterialItem[]>([]);
  const [verifications, setVerifications] = useState<Record<string, Verification>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadMaterialItems();
    loadExistingVerifications();
  }, [jobId]);

  const loadMaterialItems = async () => {
    try {
      const response = await fetch(`/api/materials/items?job_id=${jobId}`);
      const data = await response.json();
      if (data.items) {
        setItems(data.items);
      }
    } catch (error) {
      console.error("Error loading material items:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadExistingVerifications = async () => {
    try {
      const response = await fetch(`/api/materials/verification?job_id=${jobId}`);
      const data = await response.json();
      if (data.verifications) {
        const verificationsMap: Record<string, Verification> = {};
        data.verifications.forEach((v: any) => {
          verificationsMap[v.material_item_id] = {
            id: v.id,
            material_item_id: v.material_item_id,
            quantity_found: v.quantity_found,
            status: v.status,
            photo_url: v.photo_url,
          };
        });
        setVerifications(verificationsMap);
      }
    } catch (error) {
      console.error("Error loading verifications:", error);
    }
  };

  const handleQuantityChange = (itemId: string, quantity: string) => {
    const numQuantity = quantity === "" ? null : parseFloat(quantity);
    const item = items.find((i) => i.id === itemId);
    
    if (!item) return;

    let status = "pending";
    if (numQuantity !== null) {
      if (numQuantity === item.quantity_expected) {
        status = "matched";
      } else if (numQuantity < item.quantity_expected) {
        status = "shortage";
      } else {
        status = "extra";
      }
    }

    setVerifications({
      ...verifications,
      [itemId]: {
        ...verifications[itemId],
        material_item_id: itemId,
        quantity_found: numQuantity,
        status,
      },
    });
  };

  const handlePhotoCapture = async (itemId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("job_id", jobId);
        formData.append("photo_type", "verification");

        const response = await fetch("/api/materials/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (data.url) {
          setVerifications({
            ...verifications,
            [itemId]: {
              ...verifications[itemId],
              material_item_id: itemId,
              photo_url: data.url,
            },
          });
        } else {
          alert("Failed to upload photo");
        }
      } catch (error) {
        console.error("Error uploading photo:", error);
        alert("Failed to upload photo");
      }
    };
    input.click();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "matched":
        return <Check className="text-green-600" size={20} />;
      case "shortage":
        return <AlertTriangle className="text-orange-600" size={20} />;
      case "wrong_material":
        return <X className="text-red-600" size={20} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "matched":
        return "bg-green-50 border-green-500";
      case "shortage":
        return "bg-orange-50 border-orange-500";
      case "wrong_material":
        return "bg-red-50 border-red-500";
      default:
        return "bg-gray-50 border-gray-300";
    }
  };

  const handleSubmit = async () => {
    // Get employee ID from session
    const session = JSON.parse(localStorage.getItem("crewSession") || "{}");
    const employeeId = session.employee?.id || null;

    setSubmitting(true);
    try {
      const promises = Object.values(verifications).map((verification) => {
        if (verification.quantity_found === null) return Promise.resolve();

        return fetch("/api/materials/verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: jobId,
            material_item_id: verification.material_item_id,
            quantity_found: verification.quantity_found,
            verified_by: employeeId,
            photo_url: verification.photo_url || null,
          }),
        });
      });

      await Promise.all(promises);
      alert("Material verification submitted successfully!");
      router.back();
    } catch (error: any) {
      alert(error.message || "Failed to submit verification");
    } finally {
      setSubmitting(false);
    }
  };

  const allVerified = items.every(
    (item) => verifications[item.id]?.quantity_found !== null && verifications[item.id]?.quantity_found !== undefined
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading materials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-orange-600 text-white p-4">
        <button onClick={() => router.back()} className="text-white mb-2">
          ← Back
        </button>
        <h1 className="text-xl font-bold">Material Verification</h1>
        <p className="text-sm text-orange-100 mt-1">
          Verify all materials before starting work
        </p>
      </div>

      <div className="p-4 space-y-4">
        {items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
            <p className="text-gray-600">No materials listed for this job.</p>
            <p className="text-sm text-gray-500 mt-2">
              Contact the office to add material items.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const verification = verifications[item.id];
            const status = verification?.status || "pending";

            return (
              <div
                key={item.id}
                className={`bg-white border-2 rounded-lg p-4 ${getStatusColor(status)}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Expected: {item.quantity_expected} {item.unit || "units"}
                    </p>
                  </div>
                  {getStatusIcon(status)}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity Found
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={verification?.quantity_found || ""}
                      onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter quantity found"
                    />
                  </div>

                  {verification?.photo_url && (
                    <div className="relative">
                      <img
                        src={verification.photo_url}
                        alt="Verification photo"
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    </div>
                  )}

                  <button
                    onClick={() => handlePhotoCapture(item.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-orange-500 hover:text-orange-500"
                  >
                    <Camera size={20} />
                    <span>{verification?.photo_url ? "Change Photo" : "Add Photo"}</span>
                  </button>

                  {status === "shortage" && (
                    <div className="bg-orange-100 border border-orange-300 rounded-lg p-2">
                      <p className="text-xs text-orange-800">
                        ⚠️ Shortage detected: {item.quantity_expected - (verification?.quantity_found || 0)} {item.unit || "units"} missing
                      </p>
                    </div>
                  )}

                  {status === "extra" && (
                    <div className="bg-blue-100 border border-blue-300 rounded-lg p-2">
                      <p className="text-xs text-blue-800">
                        ℹ️ Extra materials: {(verification?.quantity_found || 0) - item.quantity_expected} {item.unit || "units"} more than expected
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Submit Button */}
        {items.length > 0 && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !allVerified}
            className="w-full bg-orange-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Submitting..."
              : allVerified
              ? "Submit Verification"
              : "Complete All Items"}
          </button>
        )}
      </div>
    </div>
  );
}
























