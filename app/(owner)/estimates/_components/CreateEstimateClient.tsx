"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RoofType = "Asphalt" | "Metal" | "Tile" | "Flat";
type Scope = "Repair" | "Partial" | "Full Replacement";

type GenerateResponse = {
  estimate_text: string;
  total_price: number;
  subtotal: number;
  taxes: number;
  line_items: Array<{ category: string; description: string; amount: number }>;
};

export default function CreateEstimateClient({ autoOpen }: { autoOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [roofType, setRoofType] = useState<RoofType>("Asphalt");
  const [roofSizeValue, setRoofSizeValue] = useState<number>(20);
  const [roofSizeUnit, setRoofSizeUnit] = useState<"squares" | "sqft">("squares");
  const [scope, setScope] = useState<Scope>("Full Replacement");

  const [tearOff, setTearOff] = useState<boolean>(true);
  const [deckingRepair, setDeckingRepair] = useState<boolean>(false);
  const [insuranceJob, setInsuranceJob] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  const [generated, setGenerated] = useState<GenerateResponse | null>(null);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const sizeText = useMemo(() => {
    const v = Number.isFinite(roofSizeValue) ? roofSizeValue : 0;
    return roofSizeUnit === "squares" ? `${v} squares` : `${v} sq ft`;
  }, [roofSizeUnit, roofSizeValue]);

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/estimates/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName,
          address,
          roof_type: roofType,
          roof_size_value: roofSizeValue,
          roof_size_unit: roofSizeUnit,
          scope,
          tear_off_required: tearOff,
          decking_repair: deckingRepair,
          insurance_job: insuranceJob,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to generate estimate");
      setGenerated(json);
      setStep("preview");
    } catch (e: any) {
      setError(e?.message || "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!generated) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/estimates/ai/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName,
          address,
          roof_type: roofType,
          size: sizeText,
          scope,
          estimate_text: generated.estimate_text,
          total_price: generated.total_price,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save estimate");
      setOpen(false);
      setStep("form");
      setGenerated(null);
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
    setStep("form");
    setGenerated(null);
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
      >
        + Create Estimate
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl border">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="text-sm font-semibold">Create Estimate</div>
              <button onClick={close} className="text-sm text-slate-600 hover:text-slate-900">
                Close
              </button>
            </div>

            {error && (
              <div className="px-4 pt-4">
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              </div>
            )}

            {step === "form" ? (
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Customer Name</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="John Smith"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Property Address</label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="123 Main St, City, ST 12345"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Roof Type</label>
                  <select
                    value={roofType}
                    onChange={(e) => setRoofType(e.target.value as RoofType)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option>Asphalt</option>
                    <option>Metal</option>
                    <option>Tile</option>
                    <option>Flat</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Roof Size</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={roofSizeValue}
                      onChange={(e) => setRoofSizeValue(Number(e.target.value))}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      min={0}
                      step={0.1}
                    />
                    <select
                      value={roofSizeUnit}
                      onChange={(e) => setRoofSizeUnit(e.target.value as any)}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="squares">Squares</option>
                      <option value="sqft">Sq Ft</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Scope</label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as Scope)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option>Repair</option>
                    <option>Partial</option>
                    <option>Full Replacement</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Options</label>
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={tearOff} onChange={(e) => setTearOff(e.target.checked)} />
                      Tear-off required
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={deckingRepair}
                        onChange={(e) => setDeckingRepair(e.target.checked)}
                      />
                      Decking repair
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={insuranceJob}
                        onChange={(e) => setInsuranceJob(e.target.checked)}
                      />
                      Insurance job
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-medium">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm min-h-[90px]"
                    placeholder="Anything special the homeowner mentioned…"
                  />
                </div>

                <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2">
                  <button onClick={close} className="px-3 py-2 rounded-lg border text-sm">
                    Cancel
                  </button>
                  <button
                    onClick={generate}
                    disabled={loading || !customerName.trim() || !address.trim()}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {loading ? "Generating…" : "Generate"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Preview</div>
                    <div className="text-xs text-slate-600">
                      {customerName} • {roofType} • {sizeText} • {scope}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    Total: {generated ? `$${generated.total_price.toFixed(2)}` : ""}
                  </div>
                </div>

                <div className="rounded-lg border bg-slate-50 p-3 max-h-[55vh] overflow-auto">
                  <pre className="whitespace-pre-wrap text-sm text-slate-900">
                    {generated?.estimate_text}
                  </pre>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setStep("form")}
                    className="px-3 py-2 rounded-lg border text-sm"
                    disabled={saving}
                  >
                    Back
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={close} className="px-3 py-2 rounded-lg border text-sm" disabled={saving}>
                      Cancel
                    </button>
                    <button
                      onClick={save}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}











