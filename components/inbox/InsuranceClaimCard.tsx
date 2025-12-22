// Block 20250 — Insurance Claim Card

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

interface InsuranceClaimCardProps {
  conversationId: string;
  initialIsClaim?: boolean | null;
  initialCarrier?: string | null;
  initialClaimNumber?: string | null;
  initialAdjusterName?: string | null;
  initialAdjusterPhone?: string | null;
  initialAdjusterEmail?: string | null;
  initialDeductible?: number | null;
  initialStatus?: string | null;
  initialNotes?: string | null;
  onUpdated?: (patch: any) => void;
}

export function InsuranceClaimCard({
  conversationId,
  initialIsClaim,
  initialCarrier,
  initialClaimNumber,
  initialAdjusterName,
  initialAdjusterPhone,
  initialAdjusterEmail,
  initialDeductible,
  initialStatus,
  initialNotes,
  onUpdated,
}: InsuranceClaimCardProps) {
  const [isClaim, setIsClaim] = useState(!!initialIsClaim);
  const [carrier, setCarrier] = useState(initialCarrier || "");
  const [claimNumber, setClaimNumber] = useState(initialClaimNumber || "");
  const [adjusterName, setAdjusterName] = useState(initialAdjusterName || "");
  const [adjusterPhone, setAdjusterPhone] = useState(initialAdjusterPhone || "");
  const [adjusterEmail, setAdjusterEmail] = useState(initialAdjusterEmail || "");
  const [deductible, setDeductible] = useState(
    initialDeductible != null ? String(initialDeductible) : ""
  );
  const [status, setStatus] = useState(initialStatus || "");
  const [notes, setNotes] = useState(initialNotes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/inbox/insurance-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          is_insurance_claim: isClaim,
          insurance_carrier: carrier || null,
          insurance_claim_number: claimNumber || null,
          insurance_adjuster_name: adjusterName || null,
          insurance_adjuster_phone: adjusterPhone || null,
          insurance_adjuster_email: adjusterEmail || null,
          insurance_deductible: deductible ? Number(deductible) : null,
          insurance_status: status || null,
          insurance_notes: notes || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save insurance info");
      }

      const json = await res.json();
      setSaving(false);

      if (json?.conversation && onUpdated) {
        onUpdated(json.conversation);
      }
    } catch (error) {
      console.error("Failed to save insurance info:", error);
      setSaving(false);
      alert("Failed to save insurance info. Please try again.");
    }
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base font-semibold">Insurance claim</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Track claim details</p>
            </div>
          </div>
          {saving && (
            <span className="text-[10px] text-gray-400">Saving…</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-[11px]">
          <input
            id={`claim-toggle-${conversationId}`}
            type="checkbox"
            checked={isClaim}
            onChange={(e) => setIsClaim(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <label
            htmlFor={`claim-toggle-${conversationId}`}
            className="text-gray-600 cursor-pointer"
          >
            This roof is going through insurance
          </label>
        </div>

        {isClaim && (
          <div className="space-y-2 text-xs">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                Carrier
              </label>
              <input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="State Farm, Allstate, etc."
              />
            </div>

            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                Claim number
              </label>
              <input
                value={claimNumber}
                onChange={(e) => setClaimNumber(e.target.value)}
                className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Claim ID"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">
                  Adjuster name
                </label>
                <input
                  value={adjusterName}
                  onChange={(e) => setAdjusterName(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">
                  Adjuster phone
                </label>
                <input
                  value={adjusterPhone}
                  onChange={(e) => setAdjusterPhone(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                Adjuster email
              </label>
              <input
                type="email"
                value={adjusterEmail}
                onChange={(e) => setAdjusterEmail(e.target.value)}
                className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="adjuster@insurance.com"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">
                  Deductible ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={deductible}
                  onChange={(e) => setDeductible(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g. 1000"
                />
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select status</option>
                  <option value="not_started">Not started</option>
                  <option value="filed">Filed</option>
                  <option value="inspection_scheduled">
                    Inspection scheduled
                  </option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                  <option value="paid">Paid / funded</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full border rounded-lg px-2 py-1 text-[11px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Any details about adjuster visits, supplements, etc."
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            size="sm"
            className="px-3 py-1 rounded-full bg-black text-white text-xs disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save insurance info"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


