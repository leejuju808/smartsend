"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MapPin, Plus, X } from "lucide-react";

interface ServiceAreasSettingsProps {
  canEdit: boolean;
}

export default function ServiceAreasSettings({ canEdit }: ServiceAreasSettingsProps) {
  const [primaryCity, setPrimaryCity] = useState("");
  const [zipCodes, setZipCodes] = useState<string[]>([]);
  const [newZipCode, setNewZipCode] = useState("");
  const [serviceRadius, setServiceRadius] = useState(25);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [newNeighborhood, setNewNeighborhood] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings/service-areas");
      const data = await res.json();
      
      if (data.settings?.serviceAreas) {
        const areas = data.settings.serviceAreas;
        setPrimaryCity(areas.primary_city || "");
        setZipCodes(areas.zip_codes_served || []);
        setServiceRadius(areas.service_radius_miles || 25);
        setNeighborhoods(areas.neighborhoods || []);
      }
    } catch (error) {
      console.error("Failed to load service areas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/service-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceAreas: {
            primary_city: primaryCity || null,
            zip_codes_served: zipCodes,
            service_radius_miles: serviceRadius,
            neighborhoods: neighborhoods,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Service areas updated!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const addZipCode = () => {
    if (newZipCode.trim() && !zipCodes.includes(newZipCode.trim())) {
      setZipCodes([...zipCodes, newZipCode.trim()]);
      setNewZipCode("");
    }
  };

  const removeZipCode = (zip: string) => {
    setZipCodes(zipCodes.filter((z) => z !== zip));
  };

  const addNeighborhood = () => {
    if (newNeighborhood.trim() && !neighborhoods.includes(newNeighborhood.trim())) {
      setNeighborhoods([...neighborhoods, newNeighborhood.trim()]);
      setNewNeighborhood("");
    }
  };

  const removeNeighborhood = (neighborhood: string) => {
    setNeighborhoods(neighborhoods.filter((n) => n !== neighborhood));
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Service Areas</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Service Areas</h1>
        <p className="text-sm text-gray-600">
          Roofing-specific service territories: cities, zip codes, neighborhoods, radius
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Primary City <span className="text-red-500">*</span>
          </label>
          <Input
            value={primaryCity}
            onChange={(e) => setPrimaryCity(e.target.value)}
            placeholder="Tacoma"
            disabled={!canEdit}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Zip Codes Served
          </label>
          <div className="flex gap-2 mb-2">
            <Input
              value={newZipCode}
              onChange={(e) => setNewZipCode(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addZipCode()}
              placeholder="98401"
              disabled={!canEdit}
              className="flex-1"
            />
            {canEdit && (
              <Button onClick={addZipCode} type="button" className="px-4">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {zipCodes.map((zip) => (
              <div
                key={zip}
                className="flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
              >
                <MapPin className="h-3 w-3" />
                {zip}
                {canEdit && (
                  <button
                    onClick={() => removeZipCode(zip)}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Service Radius (miles)
          </label>
          <Input
            type="number"
            value={serviceRadius}
            onChange={(e) => setServiceRadius(parseInt(e.target.value) || 25)}
            disabled={!canEdit}
            min={5}
            max={50}
          />
          <p className="mt-1 text-xs text-gray-500">
            Service radius between 5-50 miles
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Neighborhoods
          </label>
          <div className="flex gap-2 mb-2">
            <Input
              value={newNeighborhood}
              onChange={(e) => setNewNeighborhood(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addNeighborhood()}
              placeholder="Eagle Ridge"
              disabled={!canEdit}
              className="flex-1"
            />
            {canEdit && (
              <Button onClick={addNeighborhood} type="button" className="px-4">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {neighborhoods.map((neighborhood) => (
              <div
                key={neighborhood}
                className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm"
              >
                <MapPin className="h-3 w-3" />
                {neighborhood}
                {canEdit && (
                  <button
                    onClick={() => removeNeighborhood(neighborhood)}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}

        {message && (
          <div
            className={`p-3 rounded-lg ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}





















































