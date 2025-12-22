"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface PermissionsSettingsProps {
  canEdit: boolean;
}

export default function PermissionsSettings({ canEdit }: PermissionsSettingsProps) {
  const [memberCanMergeLeads, setMemberCanMergeLeads] = useState(false);
  const [memberCanCreatePlaybooks, setMemberCanCreatePlaybooks] = useState(false);
  const [memberCanEditCampaigns, setMemberCanEditCampaigns] = useState(true);
  const [memberCanLaunchCampaigns, setMemberCanLaunchCampaigns] = useState(false);
  const [memberCanChangeCompanyOwners, setMemberCanChangeCompanyOwners] = useState(true);
  const [readOnlyCanViewCompany360, setReadOnlyCanViewCompany360] = useState(false);
  const [readOnlyCanViewDeals, setReadOnlyCanViewDeals] = useState(true);
  const [readOnlyCanViewTemplates, setReadOnlyCanViewTemplates] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      
      if (data.settings?.permissions) {
        setMemberCanMergeLeads(data.settings.permissions.member_can_merge_leads ?? false);
        setMemberCanCreatePlaybooks(data.settings.permissions.member_can_create_playbooks ?? false);
        setMemberCanEditCampaigns(data.settings.permissions.member_can_edit_campaigns ?? true);
        setMemberCanLaunchCampaigns(data.settings.permissions.member_can_launch_campaigns ?? false);
        setMemberCanChangeCompanyOwners(data.settings.permissions.member_can_change_company_owners ?? true);
        setReadOnlyCanViewCompany360(data.settings.permissions.read_only_can_view_company_360 ?? false);
        setReadOnlyCanViewDeals(data.settings.permissions.read_only_can_view_deals ?? true);
        setReadOnlyCanViewTemplates(data.settings.permissions.read_only_can_view_templates ?? true);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: {
            member_can_merge_leads: memberCanMergeLeads,
            member_can_create_playbooks: memberCanCreatePlaybooks,
            member_can_edit_campaigns: memberCanEditCampaigns,
            member_can_launch_campaigns: memberCanLaunchCampaigns,
            member_can_change_company_owners: memberCanChangeCompanyOwners,
            read_only_can_view_company_360: readOnlyCanViewCompany360,
            read_only_can_view_deals: readOnlyCanViewDeals,
            read_only_can_view_templates: readOnlyCanViewTemplates,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Permissions updated!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Permissions & Roles</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Permissions & Roles</h1>
        <p className="text-sm text-gray-600">
          Configure what each role can do in your workspace
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-8">
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Member Permissions</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={memberCanEditCampaigns}
                onChange={(e) => setMemberCanEditCampaigns(e.target.checked)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Can edit campaigns</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={memberCanLaunchCampaigns}
                onChange={(e) => setMemberCanLaunchCampaigns(e.target.checked)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Can launch campaigns</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={memberCanCreatePlaybooks}
                onChange={(e) => setMemberCanCreatePlaybooks(e.target.checked)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Can create playbooks</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={memberCanMergeLeads}
                onChange={(e) => setMemberCanMergeLeads(e.target.checked)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Can merge leads</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={memberCanChangeCompanyOwners}
                onChange={(e) => setMemberCanChangeCompanyOwners(e.target.checked)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Can change company owners</span>
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Read-Only Permissions</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={readOnlyCanViewCompany360}
                onChange={(e) => setReadOnlyCanViewCompany360(e.target.checked)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Can view Company 360</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={readOnlyCanViewDeals}
                onChange={(e) => setReadOnlyCanViewDeals(e.target.checked)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Can view Deals</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={readOnlyCanViewTemplates}
                onChange={(e) => setReadOnlyCanViewTemplates(e.target.checked)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Can view Templates</span>
            </label>
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








