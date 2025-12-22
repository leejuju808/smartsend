// Block 20260 — Property & Roof Snapshot Card
// Block 20300 — Property Enrichment & Roof Age Guess v1

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

interface PropertyRoofCardProps {
  conversationId: string;
  initialSqft?: number | null;
  initialBedrooms?: number | null;
  initialBathrooms?: number | null;
  initialYearBuilt?: number | null;
  initialEstimatedValue?: number | null;
  initialRoofMaterial?: string | null;
  initialRoofLastReplacementYear?: number | null;
  initialRoofAgeEstimated?: number | null;
  onUpdated?: (patch: any) => void;
}

export function PropertyRoofCard({
  conversationId,
  initialSqft,
  initialBedrooms,
  initialBathrooms,
  initialYearBuilt,
  initialEstimatedValue,
  initialRoofMaterial,
  initialRoofLastReplacementYear,
  initialRoofAgeEstimated,
  onUpdated,
}: PropertyRoofCardProps) {
  const [sqft, setSqft] = useState(
    initialSqft != null ? String(initialSqft) : ""
  );
  const [beds, setBeds] = useState(
    initialBedrooms != null ? String(initialBedrooms) : ""
  );
  const [baths, setBaths] = useState(
    initialBathrooms != null ? String(initialBathrooms) : ""
  );
  const [yearBuilt, setYearBuilt] = useState(
    initialYearBuilt != null ? String(initialYearBuilt) : ""
  );
  const [homeValue, setHomeValue] = useState(
    initialEstimatedValue != null ? String(initialEstimatedValue) : ""
  );

  const [roofMaterial, setRoofMaterial] = useState(initialRoofMaterial || "");
  const [roofLastYear, setRoofLastYear] = useState(
    initialRoofLastReplacementYear != null
      ? String(initialRoofLastReplacementYear)
      : ""
  );
  const [roofAge, setRoofAge] = useState(
    initialRoofAgeEstimated != null ? String(initialRoofAgeEstimated) : ""
  );

  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  async function autoFillFromAddress() {
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch("/api/inbox/property-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to auto-fill from address");
      }

      const json = await res.json();

      if (json.error) {
        setEnrichError(json.error);
      }

      const c = json.conversation;
      if (c) {
        if (c.property_sqft != null) setSqft(String(c.property_sqft));
        if (c.property_bedrooms != null)
          setBeds(String(c.property_bedrooms));
        if (c.property_bathrooms != null)
          setBaths(String(c.property_bathrooms));
        if (c.property_year_built != null)
          setYearBuilt(String(c.property_year_built));
        if (c.property_estimated_value != null)
          setHomeValue(String(c.property_estimated_value));
        if (c.roof_last_replacement_year != null)
          setRoofLastYear(String(c.roof_last_replacement_year));
        if (c.roof_age_estimated != null)
          setRoofAge(String(c.roof_age_estimated));

        if (onUpdated) onUpdated(c);
      }
    } catch (err: any) {
      console.error("Property enrichment error", err);
      setEnrichError(err.message || "Failed to auto-fill from address");
    } finally {
      setEnriching(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/inbox/property-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          property_sqft: sqft ? Number(sqft) : null,
          property_bedrooms: beds ? Number(beds) : null,
          property_bathrooms: baths ? Number(baths) : null,
          property_year_built: yearBuilt ? Number(yearBuilt) : null,
          property_estimated_value: homeValue ? Number(homeValue) : null,
          roof_material: roofMaterial || null,
          roof_last_replacement_year: roofLastYear ? Number(roofLastYear) : null,
          roof_age_estimated: roofAge ? Number(roofAge) : null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save property info");
      }

      const json = await res.json();
      setSaving(false);

      if (json?.conversation && onUpdated) {
        onUpdated(json.conversation);
      }
    } catch (error) {
      console.error("Failed to save property info:", error);
      setSaving(false);
      alert("Failed to save property info. Please try again.");
    }
  }

  return (
    <Card className="border-l-4 border-l-green-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Home className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base font-semibold">
                Property & roof snapshot
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">House & roof details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={autoFillFromAddress}
              disabled={enriching}
              size="sm"
              variant="outline"
              className="px-2 py-1 rounded-full border border-gray-300 text-[11px] hover:border-black disabled:opacity-50"
            >
              {enriching ? "Looking up…" : "Auto-fill from address"}
            </Button>
            {saving && (
              <span className="text-[10px] text-gray-400">Saving…</span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {enrichError && (
          <p className="text-[10px] text-red-500">{enrichError}</p>
        )}
        <div className="space-y-2 text-xs">
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Home details</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Sqft
                </label>
                <input
                  value={sqft}
                  onChange={(e) => setSqft(e.target.value)}
                  type="number"
                  min={0}
                  className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g. 2200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Year built
                </label>
                <input
                  value={yearBuilt}
                  onChange={(e) => setYearBuilt(e.target.value)}
                  type="number"
                  className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g. 1998"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Beds
                </label>
                <input
                  value={beds}
                  onChange={(e) => setBeds(e.target.value)}
                  type="number"
                  min={0}
                  className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="3"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Baths
                </label>
                <input
                  value={baths}
                  onChange={(e) => setBaths(e.target.value)}
                  type="number"
                  min={0}
                  step="0.5"
                  className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="2"
                />
              </div>
            </div>

            <div className="mt-2">
              <label className="block text-[11px] text-gray-500 mb-0.5">
                Home value ($, est.)
              </label>
              <input
                value={homeValue}
                onChange={(e) => setHomeValue(e.target.value)}
                type="number"
                min={0}
                className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g. 450000"
              />
            </div>
          </div>

          <div className="border-t pt-2 mt-2">
            <p className="text-[11px] text-gray-500 mb-1">Roof details</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Material
                </label>
                <select
                  value={roofMaterial}
                  onChange={(e) => setRoofMaterial(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select</option>
                  <option value="asphalt">Asphalt shingle</option>
                  <option value="metal">Metal</option>
                  <option value="tile">Tile</option>
                  <option value="wood">Wood shake</option>
                  <option value="flat">Flat / membrane</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Est. age (yrs)
                </label>
                <input
                  value={roofAge}
                  onChange={(e) => setRoofAge(e.target.value)}
                  type="number"
                  min={0}
                  className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g. 18"
                />
              </div>
            </div>

            <div className="mt-2">
              <label className="block text-[11px] text-gray-500 mb-0.5">
                Last replacement year
              </label>
              <input
                value={roofLastYear}
                onChange={(e) => setRoofLastYear(e.target.value)}
                type="number"
                className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g. 2007"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            size="sm"
            className="px-3 py-1 rounded-full bg-black text-white text-xs disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save property info"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

