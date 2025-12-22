"use client";

import { useState, useEffect } from "react";
import { Shield, CheckCircle, XCircle, AlertTriangle, Download, Trash2, FileText } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";
import { getComplianceSummary, updateComplianceHealthScore } from "@/lib/compliance/compliance";

interface ComplianceSettingsProps {
  canEdit: boolean;
}

export default function ComplianceSettings({ canEdit }: ComplianceSettingsProps) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  
  // Form state
  const [physicalAddress, setPhysicalAddress] = useState("");
  const [autoFooter, setAutoFooter] = useState(true);
  const [requireConsent, setRequireConsent] = useState(false);
  const [dataRetentionMonths, setDataRetentionMonths] = useState<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const supabase = createClientComponentClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) return;

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

        // Load workspace settings
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("physical_address, auto_footer, require_consent, data_retention_months, compliance_health_score")
          .eq("id", wsId)
          .single();

        if (workspace) {
          setPhysicalAddress(workspace.physical_address || "");
          setAutoFooter(workspace.auto_footer ?? true);
          setRequireConsent(workspace.require_consent ?? false);
          setDataRetentionMonths(workspace.data_retention_months);
        }

        // Load compliance summary
        const summaryData = await getComplianceSummary(wsId);
        setSummary(summaryData);
      } catch (error) {
        console.error("Error loading compliance data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleSave = async () => {
    if (!workspaceId || !canEdit) return;

    setSaving(true);
    try {
      const supabase = createClientComponentClient();
      
      const { error } = await supabase
        .from("workspaces")
        .update({
          physical_address: physicalAddress.trim() || null,
          auto_footer: autoFooter,
          require_consent: requireConsent,
          data_retention_months: dataRetentionMonths,
        })
        .eq("id", workspaceId);

      if (error) throw error;

      // Update health score
      await updateComplianceHealthScore(workspaceId);

      // Reload summary
      const summaryData = await getComplianceSummary(workspaceId);
      setSummary(summaryData);

      alert("Compliance settings saved successfully!");
    } catch (error: any) {
      console.error("Error saving compliance settings:", error);
      alert("Failed to save settings: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getHealthScoreBg = (score: number) => {
    if (score >= 90) return "bg-green-50 border-green-200";
    if (score >= 70) return "bg-yellow-50 border-yellow-200";
    return "bg-red-50 border-red-200";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const healthScore = summary?.compliance_health_score || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Compliance</h1>
        <p className="mt-2 text-sm text-gray-600">
          Configure GDPR, CAN-SPAM, CASL compliance settings and data retention rules.
        </p>
      </div>

      {/* Compliance Health Score */}
      <div className={`border rounded-lg p-6 ${getHealthScoreBg(healthScore)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Compliance Health</h2>
            <p className="text-sm text-gray-600 mt-1">
              Your workspace compliance rating
            </p>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold ${getHealthScoreColor(healthScore)}`}>
              {healthScore}/100
            </div>
            <p className="text-xs text-gray-600 mt-1">Workspace Compliance</p>
          </div>
        </div>
      </div>

      {/* CAN-SPAM Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">CAN-SPAM Compliance</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Physical Address <span className="text-red-500">*</span>
            </label>
            <textarea
              value={physicalAddress}
              onChange={(e) => setPhysicalAddress(e.target.value)}
              disabled={!canEdit}
              placeholder="123 Main St, City, State ZIP, Country"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              rows={3}
            />
            <p className="mt-1 text-xs text-gray-500">
              Required by CAN-SPAM Act. This address will be included in all email footers.
            </p>
          </div>

          <div className="flex items-start">
            <input
              type="checkbox"
              id="auto_footer"
              checked={autoFooter}
              onChange={(e) => setAutoFooter(e.target.checked)}
              disabled={!canEdit}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="auto_footer" className="ml-3 text-sm text-gray-700">
              <span className="font-medium">Automatic Footer</span>
              <p className="text-xs text-gray-500 mt-1">
                Automatically append unsubscribe link and physical address to all emails. Required for CAN-SPAM compliance.
              </p>
            </label>
          </div>
        </div>
      </div>

      {/* CASL Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">CASL Compliance (Canada)</h2>
        
        <div className="space-y-4">
          <div className="flex items-start">
            <input
              type="checkbox"
              id="require_consent"
              checked={requireConsent}
              onChange={(e) => setRequireConsent(e.target.checked)}
              disabled={!canEdit}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="require_consent" className="ml-3 text-sm text-gray-700">
              <span className="font-medium">Require Express Consent</span>
              <p className="text-xs text-gray-500 mt-1">
                Block sending to leads without express consent. Required for CASL compliance in Canada. Consent expires after 24 months.
              </p>
            </label>
          </div>

          {summary && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Leads with Consent:</span>
                  <span className="ml-2 font-semibold text-green-600">
                    {summary.consented_count || 0}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Missing Consent:</span>
                  <span className="ml-2 font-semibold text-yellow-600">
                    {summary.missing_consent_count || 0}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Expired Consent:</span>
                  <span className="ml-2 font-semibold text-red-600">
                    {summary.expired_consent_count || 0}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data Retention */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Retention Rules</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Retain Lead Data
            </label>
            <select
              value={dataRetentionMonths || ""}
              onChange={(e) => setDataRetentionMonths(e.target.value ? parseInt(e.target.value) : null)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">No expiry (default)</option>
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="24">24 months</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              PII will be cleared after the retention period expires. Non-PII metadata will be retained.
            </p>
          </div>
        </div>
      </div>

      {/* Footer Preview */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Footer Preview</h2>
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <p className="text-sm text-gray-700 whitespace-pre-line">
            {autoFooter ? (
              <>
                ---{'\n'}
                You are receiving this message because {summary?.workspace_name || 'we'} attempted to contact you for business purposes.{'\n\n'}
                To stop receiving messages: [unsubscribe_link]{'\n'}
                {physicalAddress && `Physical Address: ${physicalAddress}\n`}
              </>
            ) : (
              "Footer disabled. Enable 'Automatic Footer' to show compliance footer."
            )}
          </p>
        </div>
      </div>

      {/* Compliance Stats */}
      {summary && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Compliance Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{summary.gdpr_erased_count || 0}</div>
              <div className="text-xs text-gray-600 mt-1">GDPR Erased</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{summary.cannot_email_count || 0}</div>
              <div className="text-xs text-gray-600 mt-1">Opted Out</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{summary.consented_count || 0}</div>
              <div className="text-xs text-gray-600 mt-1">With Consent</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{summary.missing_consent_count || 0}</div>
              <div className="text-xs text-gray-600 mt-1">Missing Consent</div>
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !physicalAddress.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Save Compliance Settings
              </>
            )}
          </button>
        </div>
      )}

      {!canEdit && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            You don't have permission to edit compliance settings. Only Owners and Admins can modify these settings.
          </p>
        </div>
      )}
    </div>
  );
}



