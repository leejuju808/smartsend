"use client";

import { useState, useEffect } from "react";
import { Building2, Save, Loader2, AlertCircle, CheckCircle2, Shield, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContractorProfileSettingsProps {
  canEdit: boolean;
}

export default function ContractorProfileSettings({ canEdit }: ContractorProfileSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [stateRules, setStateRules] = useState<any>(null);
  const [loadingRules, setLoadingRules] = useState(false);
  const [selectedState, setSelectedState] = useState<string>("");

  // Profile state
  const [profile, setProfile] = useState({
    company_name: "",
    logo_url: "",
    years_in_business: "",
    service_area: "",
    repair_vs_replacement_focus: "balanced" as "replacement_focused" | "repair_focused" | "balanced",
    emergency_hours_enabled: false,
    emergency_hours_start: "17:00",
    emergency_hours_end: "20:00",
    storm_response_mode: "none" as "aggressive_storm_pursuit" | "insurance_only_storm_pursuit" | "repair_focused_storm_pursuit" | "none",
    follow_up_count: 3,
    message_style: "friendly" as "formal" | "casual" | "friendly" | "premium",
    formality_level: "casual" as "very_formal" | "formal" | "casual" | "very_casual",
    preferred_cta_style: "direct" as "direct" | "soft" | "question" | "value_proposition",
    booking_aggressiveness: "moderate" as "very_aggressive" | "aggressive" | "moderate" | "gentle",
  });

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (selectedState) {
      loadStateRules(selectedState);
    }
  }, [selectedState]);

  const loadProfile = async () => {
    try {
      // Get workspace ID from cookie
      const wsCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("ws="));
      const wsId = wsCookie?.split("=")[1];

      if (!wsId) {
        setLoading(false);
        return;
      }

      setWorkspaceId(wsId);

      const res = await fetch(`/api/contractor/profile?workspace_id=${wsId}`);
      const data = await res.json();

      if (data.profile) {
        setProfile({
          company_name: data.profile.company_name || "",
          logo_url: data.profile.logo_url || "",
          years_in_business: data.profile.years_in_business || "",
          service_area: data.profile.service_area || "",
          repair_vs_replacement_focus: data.profile.repair_vs_replacement_focus || "balanced",
          emergency_hours_enabled: data.profile.emergency_hours_enabled || false,
          emergency_hours_start: data.profile.emergency_hours_start || "17:00",
          emergency_hours_end: data.profile.emergency_hours_end || "20:00",
          storm_response_mode: data.profile.storm_response_mode || "none",
          follow_up_count: data.profile.follow_up_count || 3,
          message_style: data.profile.message_style || "friendly",
          formality_level: data.profile.formality_level || "casual",
          preferred_cta_style: data.profile.preferred_cta_style || "direct",
          booking_aggressiveness: data.profile.booking_aggressiveness || "moderate",
        });
      }
    } catch (error) {
      console.error("Failed to load contractor profile:", error);
      setMessage({ type: "error", text: "Failed to load profile" });
    } finally {
      setLoading(false);
    }
  };

  const loadStateRules = async (stateCode: string) => {
    if (!stateCode || stateCode.length !== 2) return;

    setLoadingRules(true);
    try {
      const res = await fetch(`/api/laws/${stateCode.toUpperCase()}`);
      const data = await res.json();
      if (data.laws) {
        setStateRules(data.laws);
      }
    } catch (error) {
      console.error("Failed to load state rules:", error);
    } finally {
      setLoadingRules(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit || !workspaceId) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/contractor/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          ...profile,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage({ type: "success", text: "Contractor profile updated successfully!" });
      setTimeout(() => setMessage(null), 5000);
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to save profile" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-5 w-5 text-gray-600" />
          <h2 className="text-xl font-semibold text-gray-900">Contractor Profile</h2>
        </div>
        <p className="text-sm text-gray-600">
          Configure your company profile, business focus, and workflow preferences. This powers SmartSend&apos;s AI personalization across messaging, scheduling, and task management.
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-2 ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Company Identity */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Company Identity</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={profile.company_name}
              onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="Example: Summit Roofing & Construction"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Logo URL
            </label>
            <input
              type="url"
              value={profile.logo_url}
              onChange={(e) => setProfile({ ...profile, logo_url: e.target.value })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Years in Business
              </label>
              <select
                value={profile.years_in_business}
                onChange={(e) => setProfile({ ...profile, years_in_business: e.target.value })}
                disabled={!canEdit}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="">Select…</option>
                <option value="0-1">0–1 years</option>
                <option value="2-5">2–5 years</option>
                <option value="6-10">6–10 years</option>
                <option value="11-20">11–20 years</option>
                <option value="20+">20+ years</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Area (City / County)
              </label>
              <input
                type="text"
                value={profile.service_area}
                onChange={(e) => setProfile({ ...profile, service_area: e.target.value })}
                disabled={!canEdit}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="Example: Tacoma / Pierce County"
              />
            </div>
          </div>
        </section>

        {/* Authority Preview (read-only) */}
        <section className="space-y-4 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-gray-900">Authority Preview</h3>
          <p className="text-sm text-gray-600">
            These are auto-injected into estimates and emails. Editing is not available in v1.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-sm font-semibold text-gray-900 mb-2">Preview: Estimate Footer</div>
              <pre className="whitespace-pre-wrap text-xs text-gray-800 font-mono leading-relaxed">
{`Why Homeowners Choose ${profile.company_name || "{{Company Name}}"}

• Local roofing professionals serving ${profile.service_area || "{{Service Area}}"}
• Clear pricing, no surprises
• Workmanship-backed warranty
• Fast scheduling and clean job sites`}
              </pre>
            </div>

            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-sm font-semibold text-gray-900 mb-2">Preview: Email Signature</div>
              <pre className="whitespace-pre-wrap text-xs text-gray-800 font-mono leading-relaxed">
{`${profile.company_name || "{{Company Name}}"}
Local Roofing Specialists
Serving ${profile.service_area || "{{City}}"} & Surrounding Areas`}
              </pre>
            </div>
          </div>
        </section>

        {/* Business Focus */}
        <section className="space-y-4 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-gray-900">Business Focus</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Repair vs Replacement Focus
            </label>
            <select
              value={profile.repair_vs_replacement_focus}
              onChange={(e) => setProfile({ ...profile, repair_vs_replacement_focus: e.target.value as any })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="replacement_focused">Replacement-Focused (Insurance or retail)</option>
              <option value="repair_focused">Repair-Focused (High volume, quick jobs)</option>
              <option value="balanced">Balanced</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              SmartSend adjusts value scoring, task priority, sequencing tone, and booking recommendations based on this.
            </p>
          </div>
        </section>

        {/* Emergency & Storm Response */}
        <section className="space-y-4 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-gray-900">Emergency & Storm Response</h3>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="emergency_hours"
              checked={profile.emergency_hours_enabled}
              onChange={(e) => setProfile({ ...profile, emergency_hours_enabled: e.target.checked })}
              disabled={!canEdit}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:bg-gray-50"
            />
            <label htmlFor="emergency_hours" className="text-sm font-medium text-gray-700">
              Enable Emergency Hours
            </label>
          </div>

          {profile.emergency_hours_enabled && (
            <div className="grid grid-cols-2 gap-4 ml-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={profile.emergency_hours_start}
                  onChange={(e) => setProfile({ ...profile, emergency_hours_start: e.target.value })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={profile.emergency_hours_end}
                  onChange={(e) => setProfile({ ...profile, emergency_hours_end: e.target.value })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Storm Response Mode
            </label>
            <select
              value={profile.storm_response_mode}
              onChange={(e) => setProfile({ ...profile, storm_response_mode: e.target.value as any })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="none">None</option>
              <option value="aggressive_storm_pursuit">Aggressive Storm Pursuit</option>
              <option value="insurance_only_storm_pursuit">Insurance-Only Storm Pursuit</option>
              <option value="repair_focused_storm_pursuit">Repair-Focused Storm Pursuit</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              SmartSend adjusts sequences, tasks, storm scoring, storm intel, and recommendations based on this.
            </p>
          </div>
        </section>

        {/* Office Workflow Preferences */}
        <section className="space-y-4 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-gray-900">Office Workflow Preferences</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Follow-up Count
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={profile.follow_up_count}
              onChange={(e) => setProfile({ ...profile, follow_up_count: parseInt(e.target.value) || 0 })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500">How many follow-ups SmartSend should send before stopping.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Style
            </label>
            <select
              value={profile.message_style}
              onChange={(e) => setProfile({ ...profile, message_style: e.target.value as any })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
              <option value="friendly">Friendly</option>
              <option value="premium">Premium</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Formality Level
            </label>
            <select
              value={profile.formality_level}
              onChange={(e) => setProfile({ ...profile, formality_level: e.target.value as any })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="very_formal">Very Formal</option>
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
              <option value="very_casual">Very Casual</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preferred CTA Style
            </label>
            <select
              value={profile.preferred_cta_style}
              onChange={(e) => setProfile({ ...profile, preferred_cta_style: e.target.value as any })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="direct">Direct</option>
              <option value="soft">Soft</option>
              <option value="question">Question</option>
              <option value="value_proposition">Value Proposition</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Booking Aggressiveness
            </label>
            <select
              value={profile.booking_aggressiveness}
              onChange={(e) => setProfile({ ...profile, booking_aggressiveness: e.target.value as any })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="very_aggressive">Very Aggressive</option>
              <option value="aggressive">Aggressive</option>
              <option value="moderate">Moderate</option>
              <option value="gentle">Gentle</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Controls how aggressively SmartSend should push bookings in messaging and sequences.
            </p>
          </div>
        </section>

        {/* Save Button */}
        {canEdit && (
          <div className="flex justify-end pt-6 border-t border-gray-200">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        )}

        {!canEdit && (
          <div className="pt-6 border-t border-gray-200">
            <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
              You don&apos;t have permission to edit contractor profile settings. Only Owners and Admins can make changes.
            </p>
          </div>
        )}
      </div>

      {/* State Rules Summary Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">State Rules Summary</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          View state-specific roofing and insurance regulations. SmartSend automatically filters messaging and suggestions based on these rules.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select State to View Rules
          </label>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a state...</option>
            <option value="WA">Washington</option>
            <option value="TX">Texas</option>
            <option value="FL">Florida</option>
            <option value="CA">California</option>
            <option value="CO">Colorado</option>
            {/* Add more states as needed */}
          </select>
        </div>

        {loadingRules && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        )}

        {stateRules && !loadingRules && (
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Deductible Laws */}
              {stateRules.deductible && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Deductible Laws
                  </h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>
                      <strong>Waiving Illegal:</strong>{" "}
                      {stateRules.deductible.waiving_illegal ? "Yes" : "No"}
                    </li>
                    <li>
                      <strong>Financing Allowed:</strong>{" "}
                      {stateRules.deductible.financing_allowed ? "Yes" : "No"}
                    </li>
                    <li>
                      <strong>Payment Plans Allowed:</strong>{" "}
                      {stateRules.deductible.payment_plans_allowed ? "Yes" : "No"}
                    </li>
                  </ul>
                </div>
              )}

              {/* Matching Laws */}
              {stateRules.matching && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Matching Laws
                  </h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>
                      <strong>Requirement:</strong>{" "}
                      {stateRules.matching.requirement_type?.replace(/_/g, " ") || "None"}
                    </li>
                    <li>
                      <strong>Affects Replacement Value:</strong>{" "}
                      {stateRules.matching.affects_replacement_value ? "Yes" : "No"}
                    </li>
                  </ul>
                </div>
              )}

              {/* Insurance Rules */}
              {stateRules.rules?.insurance && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Insurance Rules
                  </h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>
                      <strong>Can Negotiate Claims:</strong>{" "}
                      {stateRules.rules.insurance.can_negotiate_claim ? "Yes" : "No"}
                    </li>
                    <li>
                      <strong>Can Document Damage:</strong>{" "}
                      {stateRules.rules.insurance.can_document_damage ? "Yes" : "No"}
                    </li>
                    <li>
                      <strong>Can Interpret Policy:</strong>{" "}
                      {stateRules.rules.insurance.can_interpret_policy ? "Yes" : "No"}
                    </li>
                  </ul>
                </div>
              )}

              {/* Licensing Requirements */}
              {stateRules.rules?.licensing && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Licensing Requirements
                  </h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>
                      <strong>Requires License:</strong>{" "}
                      {stateRules.rules.licensing.requires_license ? "Yes" : "No"}
                    </li>
                    {stateRules.rules.licensing.license_type && (
                      <li>
                        <strong>License Type:</strong>{" "}
                        {stateRules.rules.licensing.license_type.replace(/_/g, " ")}
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Restrictions */}
            {stateRules.restrictions && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Prohibited Practices
                </h4>
                <ul className="text-sm text-gray-700 space-y-1">
                  {stateRules.restrictions.prohibited_practices && (
                    <>
                      {stateRules.restrictions.prohibited_practices.policy_interpretation && (
                        <li>❌ Policy interpretation prohibited</li>
                      )}
                      {stateRules.restrictions.prohibited_practices.negotiation_language && (
                        <li>❌ Negotiation language prohibited</li>
                      )}
                      {stateRules.restrictions.prohibited_practices.deductible_waiving && (
                        <li>❌ Deductible waiving prohibited</li>
                      )}
                    </>
                  )}
                </ul>
              </div>
            )}

            {/* Code Requirements */}
            {stateRules.code_requirements && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">Code Requirements</h4>
                <ul className="text-sm text-gray-700 space-y-1">
                  {stateRules.code_requirements.ventilation_required && (
                    <li>✓ Ventilation upgrades required</li>
                  )}
                  {stateRules.code_requirements.ice_water_shield_valleys && (
                    <li>✓ Ice & Water Shield in valleys required</li>
                  )}
                  {stateRules.code_requirements.flashing_required && (
                    <li>✓ Flashing code upgrades required</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

