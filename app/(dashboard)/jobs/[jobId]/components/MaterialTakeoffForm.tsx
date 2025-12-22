// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// Material Takeoff Form Component
// Structured fields for roofers to fill out material requirements

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface MaterialTakeoff {
  id?: string;
  shingle_brand?: string;
  shingle_color?: string;
  shingle_bundle_count?: number;
  underlayment_type?: string;
  underlayment_rolls?: number;
  ridge_cap_count?: number;
  drip_edge_count?: number;
  flashings_count?: number;
  sealant_count?: number;
  box_vents_count?: number;
  ridge_vent_count?: number;
  exhaust_fan_count?: number;
  plywood_sheets_estimate?: number;
  nails_count?: number;
  staples_count?: number;
  dump_trailer?: boolean;
  dumpster_delivery?: boolean;
  notes?: string;
}

interface MaterialTakeoffFormProps {
  jobId: string;
  onSave?: () => void;
}

const SHINGLE_BRANDS = [
  "Owens Corning",
  "GAF",
  "Malarkey",
  "CertainTeed",
  "Tamko",
  "IKO",
  "Other",
];

const UNDERLAYMENT_TYPES = [
  "Synthetic",
  "Felt",
  "Ice & Water Shield",
  "Other",
];

export function MaterialTakeoffForm({ jobId, onSave }: MaterialTakeoffFormProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [takeoff, setTakeoff] = useState<MaterialTakeoff>({});

  useEffect(() => {
    loadTakeoff();
  }, [jobId]);

  const loadTakeoff = async () => {
    try {
      const { data, error } = await supabase
        .from("material_takeoffs")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error loading takeoff:", error);
      }

      if (data) {
        setTakeoff(data);
      }
    } catch (error) {
      console.error("Error loading takeoff:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Get workspace_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!membership?.workspace_id) throw new Error("No workspace found");

      const takeoffData = {
        job_id: jobId,
        workspace_id: membership.workspace_id,
        ...takeoff,
      };

      if (takeoff.id) {
        const { error } = await supabase
          .from("material_takeoffs")
          .update(takeoffData)
          .eq("id", takeoff.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("material_takeoffs")
          .insert(takeoffData)
          .select()
          .single();

        if (error) throw error;
        if (data) setTakeoff({ ...takeoff, id: data.id });
      }

      onSave?.();
    } catch (error: any) {
      console.error("Error saving takeoff:", error);
      alert(error.message || "Failed to save takeoff");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof MaterialTakeoff, value: any) => {
    setTakeoff((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-400">Loading takeoff...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Material Takeoff
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={saving}
          className="h-7 text-xs"
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-3 w-3 mr-1" />
              Save
            </>
          )}
        </Button>
      </div>

      <div className="space-y-4 text-xs">
        {/* Shingles */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-400">Shingles</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="shingle_brand" className="text-[10px] text-zinc-500">
                Brand
              </Label>
              <Select
                value={takeoff.shingle_brand || ""}
                onValueChange={(v) => updateField("shingle_brand", v)}
              >
                <SelectTrigger id="shingle_brand" className="h-8 text-xs">
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {SHINGLE_BRANDS.map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="shingle_color" className="text-[10px] text-zinc-500">
                Color
              </Label>
              <Input
                id="shingle_color"
                value={takeoff.shingle_color || ""}
                onChange={(e) => updateField("shingle_color", e.target.value)}
                placeholder="e.g., Weathered Wood"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="shingle_bundle_count" className="text-[10px] text-zinc-500">
                Bundles
              </Label>
              <Input
                id="shingle_bundle_count"
                type="number"
                value={takeoff.shingle_bundle_count || ""}
                onChange={(e) =>
                  updateField("shingle_bundle_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Underlayment */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-400">Underlayment</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="underlayment_type" className="text-[10px] text-zinc-500">
                Type
              </Label>
              <Select
                value={takeoff.underlayment_type || ""}
                onValueChange={(v) => updateField("underlayment_type", v)}
              >
                <SelectTrigger id="underlayment_type" className="h-8 text-xs">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {UNDERLAYMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="underlayment_rolls" className="text-[10px] text-zinc-500">
                Rolls Needed
              </Label>
              <Input
                id="underlayment_rolls"
                type="number"
                value={takeoff.underlayment_rolls || ""}
                onChange={(e) =>
                  updateField("underlayment_rolls", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Accessories */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-400">Accessories</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ridge_cap_count" className="text-[10px] text-zinc-500">
                Ridge Cap (LF)
              </Label>
              <Input
                id="ridge_cap_count"
                type="number"
                value={takeoff.ridge_cap_count || ""}
                onChange={(e) =>
                  updateField("ridge_cap_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="drip_edge_count" className="text-[10px] text-zinc-500">
                Drip Edge (LF)
              </Label>
              <Input
                id="drip_edge_count"
                type="number"
                value={takeoff.drip_edge_count || ""}
                onChange={(e) =>
                  updateField("drip_edge_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="flashings_count" className="text-[10px] text-zinc-500">
                Flashings
              </Label>
              <Input
                id="flashings_count"
                type="number"
                value={takeoff.flashings_count || ""}
                onChange={(e) =>
                  updateField("flashings_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="sealant_count" className="text-[10px] text-zinc-500">
                Sealant (Tubes)
              </Label>
              <Input
                id="sealant_count"
                type="number"
                value={takeoff.sealant_count || ""}
                onChange={(e) =>
                  updateField("sealant_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Ventilation */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-400">Ventilation</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="box_vents_count" className="text-[10px] text-zinc-500">
                Box Vents
              </Label>
              <Input
                id="box_vents_count"
                type="number"
                value={takeoff.box_vents_count || ""}
                onChange={(e) =>
                  updateField("box_vents_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="ridge_vent_count" className="text-[10px] text-zinc-500">
                Ridge Vent (LF)
              </Label>
              <Input
                id="ridge_vent_count"
                type="number"
                value={takeoff.ridge_vent_count || ""}
                onChange={(e) =>
                  updateField("ridge_vent_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="exhaust_fan_count" className="text-[10px] text-zinc-500">
                Exhaust Fans
              </Label>
              <Input
                id="exhaust_fan_count"
                type="number"
                value={takeoff.exhaust_fan_count || ""}
                onChange={(e) =>
                  updateField("exhaust_fan_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Plywood / Decking */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-400">Plywood / Decking Repair</Label>
          <div>
            <Label htmlFor="plywood_sheets_estimate" className="text-[10px] text-zinc-500">
              Sheets Needed (Estimate)
            </Label>
            <Input
              id="plywood_sheets_estimate"
              type="number"
              value={takeoff.plywood_sheets_estimate || ""}
              onChange={(e) =>
                updateField("plywood_sheets_estimate", parseFloat(e.target.value) || 0)
              }
              placeholder="0"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Fasteners */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-400">Fasteners</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="nails_count" className="text-[10px] text-zinc-500">
                Nails (Boxes/Lbs)
              </Label>
              <Input
                id="nails_count"
                type="number"
                value={takeoff.nails_count || ""}
                onChange={(e) =>
                  updateField("nails_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="staples_count" className="text-[10px] text-zinc-500">
                Staples (Boxes/Lbs)
              </Label>
              <Input
                id="staples_count"
                type="number"
                value={takeoff.staples_count || ""}
                onChange={(e) =>
                  updateField("staples_count", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Dump / Disposal */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-400">Dump / Disposal</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={takeoff.dump_trailer || false}
                onChange={(e) => updateField("dump_trailer", e.target.checked)}
                className="rounded"
              />
              Dump Trailer
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={takeoff.dumpster_delivery || false}
                onChange={(e) => updateField("dumpster_delivery", e.target.checked)}
                className="rounded"
              />
              Dumpster Delivery
            </label>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes" className="text-xs font-semibold text-zinc-400">
            Notes
          </Label>
          <Textarea
            id="notes"
            value={takeoff.notes || ""}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder='e.g., "Chimney needs special flashing", "Valley is soft — order extra plywood"'
            rows={3}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}






































