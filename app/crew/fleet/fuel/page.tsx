"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Camera, DollarSign, Fuel, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type Vehicle = {
  id: string;
  name: string;
  license_plate?: string | null;
  make?: string | null;
  model?: string | null;
  photo_url?: string | null;
};

type FuelLog = {
  vehicle_id: string;
  gallons: string;
  cost: string;
  receipt_photo?: File | null;
  pump_photo?: File | null;
};

export default function CrewFuelLogPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [fuelLog, setFuelLog] = useState<FuelLog>({
    vehicle_id: "",
    gallons: "",
    cost: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/fleet/vehicles?status=active");
      const data = await response.json();
      setVehicles(data.vehicles || []);
    } catch (error) {
      console.error("Error loading vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedVehicle || !fuelLog.gallons || !fuelLog.cost) {
      alert("Please select a vehicle, enter gallons, and cost");
      return;
    }

    try {
      setSubmitting(true);
      // Upload photos if provided
      let receiptUrl = null;
      let pumpUrl = null;
      if (fuelLog.receipt_photo) {
        // TODO: Upload to storage
      }
      if (fuelLog.pump_photo) {
        // TODO: Upload to storage
      }

      const response = await fetch("/api/fleet/fuel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: selectedVehicle,
          gallons: Number(fuelLog.gallons),
          cost: Number(fuelLog.cost),
          receipt_url: receiptUrl,
          pump_photo_url: pumpUrl,
        }),
      });

      if (response.ok) {
        alert("Fuel log recorded successfully");
        // Reset form
        setSelectedVehicle(null);
        setFuelLog({
          vehicle_id: "",
          gallons: "",
          cost: "",
        });
        router.push("/crew/today");
      } else {
        const error = await response.json();
        alert(error.error || "Failed to record fuel log");
      }
    } catch (error) {
      console.error("Error recording fuel log:", error);
      alert("Failed to record fuel log");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedVehicleData = vehicles.find((v) => v.id === selectedVehicle);
  const costPerGallon =
    fuelLog.gallons && fuelLog.cost
      ? (Number(fuelLog.cost) / Number(fuelLog.gallons)).toFixed(2)
      : "0.00";

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Fuel Log</h1>
        <p className="text-gray-600 mt-1">
          Record fuel purchases with receipt photos
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
                    setFuelLog({ ...fuelLog, vehicle_id: vehicle.id });
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
                        {vehicle.make} {vehicle.model}
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="w-5 h-5" />
              Fuel Purchase Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gallons *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fuelLog.gallons}
                  onChange={(e) =>
                    setFuelLog({ ...fuelLog, gallons: e.target.value })
                  }
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Cost *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fuelLog.cost}
                  onChange={(e) =>
                    setFuelLog({ ...fuelLog, cost: e.target.value })
                  }
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
                {costPerGallon !== "0.00" && (
                  <div className="mt-1 text-xs text-gray-500">
                    ${costPerGallon} per gallon
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Receipt Photo
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) =>
                    setFuelLog({
                      ...fuelLog,
                      receipt_photo: e.target.files?.[0] || null,
                    })
                  }
                  className="flex-1 text-sm text-gray-600"
                />
                <Camera className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Take a photo of the receipt
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pump Photo (Optional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) =>
                    setFuelLog({
                      ...fuelLog,
                      pump_photo: e.target.files?.[0] || null,
                    })
                  }
                  className="flex-1 text-sm text-gray-600"
                />
                <Camera className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Photo of pump showing gallons and price
              </p>
            </div>

            <div className="pt-4 border-t">
              <Button
                onClick={handleSubmit}
                disabled={
                  !fuelLog.gallons || !fuelLog.cost || submitting
                }
                className="w-full"
              >
                {submitting ? "Recording..." : "Record Fuel Purchase"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
























