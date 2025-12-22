"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle, Camera, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

type AssignedAsset = {
  id: string;
  asset: {
    id: string;
    name: string;
    category: string;
    photo_url?: string | null;
    serial_number?: string | null;
  };
  job?: {
    id: string;
    stage: string;
  } | null;
  assigned_at: string;
};

export default function CrewAssetCheckPage() {
  const [assets, setAssets] = useState<AssignedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAsset, setCheckingAsset] = useState<string | null>(null);
  const [condition, setCondition] = useState<string>("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadAssignedAssets();
  }, []);

  const loadAssignedAssets = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/crew/assets/check");
      const data = await response.json();
      setAssets(data.assets || []);
    } catch (error) {
      console.error("Error loading assets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async (assignmentId: string) => {
    if (!condition) {
      alert("Please select equipment condition");
      return;
    }

    try {
      setCheckingAsset(assignmentId);
      
      // Upload photo if provided
      let photoUrl = null;
      if (photo) {
        // TODO: Upload photo to storage and get URL
        // For now, we'll skip photo upload
      }

      const response = await fetch("/api/crew/assets/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment_id: assignmentId,
          condition,
          photo_url: photoUrl,
          notes: notes || null,
        }),
      });

      if (response.ok) {
        alert("Equipment checked successfully");
        setCondition("");
        setPhoto(null);
        setNotes("");
        loadAssignedAssets();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to check equipment");
      }
    } catch (error) {
      console.error("Error checking asset:", error);
      alert("Failed to check equipment");
    } finally {
      setCheckingAsset(null);
    }
  };

  const getCategoryIcon = (category: string) => {
    return <Package className="w-6 h-6" />;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Equipment Check-In</h1>
        <p className="text-gray-600 mt-1">
          Check the condition of equipment assigned to you
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500">No equipment assigned to you</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {assets.map((assignment) => (
            <Card key={assignment.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {assignment.asset.photo_url ? (
                    <img
                      src={assignment.asset.photo_url}
                      alt={assignment.asset.name}
                      className="w-10 h-10 rounded object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center">
                      {getCategoryIcon(assignment.asset.category)}
                    </div>
                  )}
                  <div>
                    <div>{assignment.asset.name}</div>
                    <div className="text-sm text-gray-500 font-normal capitalize">
                      {assignment.asset.category.replace("_", " ")}
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {assignment.asset.serial_number && (
                  <div className="text-sm text-gray-600">
                    Serial: {assignment.asset.serial_number}
                  </div>
                )}

                {assignment.job && (
                  <div className="text-sm text-gray-600">
                    Job: {assignment.job.stage}
                  </div>
                )}

                <div className="text-sm text-gray-500">
                  Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}
                </div>

                {/* Condition Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Equipment Condition
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant={condition === "good" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCondition("good")}
                      className="flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Good
                    </Button>
                    <Button
                      variant={condition === "needs_repair" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCondition("needs_repair")}
                      className="flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4" />
                      Needs Repair
                    </Button>
                    <Button
                      variant={condition === "missing" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCondition("missing")}
                      className="flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Missing
                    </Button>
                  </div>
                </div>

                {/* Photo Upload */}
                {(condition === "needs_repair" || condition === "missing") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Photo (Required)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                      className="w-full text-sm text-gray-600"
                    />
                  </div>
                )}

                {/* Notes */}
                {(condition === "needs_repair" || condition === "missing") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Describe the issue..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  onClick={() => handleCheckIn(assignment.id)}
                  disabled={!condition || checkingAsset === assignment.id}
                  className="w-full"
                >
                  {checkingAsset === assignment.id
                    ? "Checking..."
                    : "Check Equipment"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
























