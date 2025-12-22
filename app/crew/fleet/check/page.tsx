"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Camera,
  Truck,
  Clock,
  Save,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

type Vehicle = {
  id: string;
  name: string;
  license_plate?: string | null;
  make?: string | null;
  model?: string | null;
  photo_url?: string | null;
};

type CheckState = "start" | "end";
type VehicleCheck = {
  vehicle_id: string;
  start_miles?: string;
  end_miles?: string;
  start_odometer_photo?: File | null;
  end_odometer_photo?: File | null;
  condition_check?: {
    tires: boolean;
    lights: boolean;
    ladders_secure: boolean;
  };
  damage_report?: string;
  date: string;
};

export default function CrewVehicleCheckPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [checkState, setCheckState] = useState<CheckState>("start");
  const [check, setCheck] = useState<VehicleCheck>({
    vehicle_id: "",
    date: new Date().toISOString().split("T")[0],
    condition_check: {
      tires: false,
      lights: false,
      ladders_secure: false,
    },
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAssignedVehicles();
  }, []);

  const loadAssignedVehicles = async () => {
    try {
      setLoading(true);
      // Get vehicles assigned to current employee
      const response = await fetch("/api/fleet/vehicles?status=active");
      const data = await response.json();
      setVehicles(data.vehicles || []);
    } catch (error) {
      console.error("Error loading vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartCheck = async () => {
    if (!selectedVehicle || !check.start_miles) {
      alert("Please select a vehicle and enter start mileage");
      return;
    }

    try {
      setSubmitting(true);
      // Upload photo if provided
      let startPhotoUrl = null;
      if (check.start_odometer_photo) {
        // TODO: Upload to storage
        // For now, we'll skip photo upload
      }

      const response = await fetch("/api/fleet/mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: selectedVehicle,
          start_miles: Number(check.start_miles),
          end_miles: Number(check.start_miles), // Same for start
          date: check.date,
          start_odometer_photo_url: startPhotoUrl,
          condition_check: check.condition_check,
        }),
      });

      if (response.ok) {
        alert("Start of day check-in recorded");
        setCheckState("end");
      } else {
        const error = await response.json();
        alert(error.error || "Failed to record check-in");
      }
    } catch (error) {
      console.error("Error recording start check:", error);
      alert("Failed to record check-in");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndCheck = async () => {
    if (!selectedVehicle || !check.end_miles || !check.start_miles) {
      alert("Please enter end mileage");
      return;
    }

    if (Number(check.end_miles) < Number(check.start_miles)) {
      alert("End mileage must be greater than start mileage");
      return;
    }

    try {
      setSubmitting(true);
      // Upload photo if provided
      let endPhotoUrl = null;
      if (check.end_odometer_photo) {
        // TODO: Upload to storage
      }

      const response = await fetch("/api/fleet/mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: selectedVehicle,
          start_miles: Number(check.start_miles),
          end_miles: Number(check.end_miles),
          date: check.date,
          end_odometer_photo_url: endPhotoUrl,
          damage_report: check.damage_report || null,
        }),
      });

      if (response.ok) {
        alert("End of day check-out recorded");
        router.push("/crew/today");
      } else {
        const error = await response.json();
        alert(error.error || "Failed to record check-out");
      }
    } catch (error) {
      console.error("Error recording end check:", error);
      alert("Failed to record check-out");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedVehicleData = vehicles.find((v) => v.id === selectedVehicle);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          {checkState === "start" ? "Start of Day" : "End of Day"} Vehicle Check
        </h1>
        <p className="text-gray-600 mt-1">
          {checkState === "start"
            ? "Record start mileage and vehicle condition"
            : "Record end mileage and any damage"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Vehicle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Truck className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No vehicles available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {vehicles.map((vehicle) => (
                <button
                  key={vehicle.id}
                  onClick={() => {
                    setSelectedVehicle(vehicle.id);
                    setCheck({ ...check, vehicle_id: vehicle.id });
                  }}
                  className={`p-4 border-2 rounded-lg text-left transition ${
                    selectedVehicle === vehicle.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {vehicle.photo_url ? (
                      <img
                        src={vehicle.photo_url}
                        alt={vehicle.name}
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                        <Truck className="w-6 h-6 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{vehicle.name}</div>
                      <div className="text-sm text-gray-500">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                        {vehicle.license_plate && ` • ${vehicle.license_plate}`}
                      </div>
                    </div>
                    {selectedVehicle === vehicle.id && (
                      <CheckCircle className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedVehicle && selectedVehicleData && (
        <>
          {checkState === "start" ? (
            <Card>
              <CardHeader>
                <CardTitle>Start of Day Check</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={check.date}
                    onChange={(e) =>
                      setCheck({ ...check, date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Mileage *
                  </label>
                  <input
                    type="number"
                    value={check.start_miles || ""}
                    onChange={(e) =>
                      setCheck({ ...check, start_miles: e.target.value })
                    }
                    placeholder="Enter odometer reading"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Odometer Photo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) =>
                      setCheck({
                        ...check,
                        start_odometer_photo: e.target.files?.[0] || null,
                      })
                    }
                    className="w-full text-sm text-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Vehicle Condition Check
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={check.condition_check?.tires || false}
                        onChange={(e) =>
                          setCheck({
                            ...check,
                            condition_check: {
                              ...check.condition_check,
                              tires: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4"
                      />
                      <span>Tires look good</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={check.condition_check?.lights || false}
                        onChange={(e) =>
                          setCheck({
                            ...check,
                            condition_check: {
                              ...check.condition_check,
                              lights: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4"
                      />
                      <span>Lights working</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={check.condition_check?.ladders_secure || false}
                        onChange={(e) =>
                          setCheck({
                            ...check,
                            condition_check: {
                              ...check.condition_check,
                              ladders_secure: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4"
                      />
                      <span>Ladders secure</span>
                    </label>
                  </div>
                </div>

                <Button
                  onClick={handleStartCheck}
                  disabled={!check.start_miles || submitting}
                  className="w-full"
                >
                  {submitting ? "Recording..." : "Record Start Check"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>End of Day Check</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-700">
                    <strong>Start Mileage:</strong> {check.start_miles?.toLocaleString()} miles
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Mileage *
                  </label>
                  <input
                    type="number"
                    value={check.end_miles || ""}
                    onChange={(e) =>
                      setCheck({ ...check, end_miles: e.target.value })
                    }
                    placeholder="Enter odometer reading"
                    min={check.start_miles || 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  {check.start_miles && check.end_miles && (
                    <div className="mt-2 text-sm text-gray-600">
                      Total miles:{" "}
                      {(Number(check.end_miles) - Number(check.start_miles)).toLocaleString()}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Odometer Photo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) =>
                      setCheck({
                        ...check,
                        end_odometer_photo: e.target.files?.[0] || null,
                      })
                    }
                    className="w-full text-sm text-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Damage Report (if any)
                  </label>
                  <textarea
                    value={check.damage_report || ""}
                    onChange={(e) =>
                      setCheck({ ...check, damage_report: e.target.value })
                    }
                    placeholder="Describe any damage or issues..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={4}
                  />
                </div>

                <Button
                  onClick={handleEndCheck}
                  disabled={!check.end_miles || submitting}
                  className="w-full"
                >
                  {submitting ? "Recording..." : "Record End Check"}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
























