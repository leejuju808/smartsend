"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Building2, Upload, Save } from "lucide-react";

interface OrgSettings {
  business_name?: string;
  industry?: string;
  logo_url?: string;
  business_address?: string;
  timezone?: string;
  default_lead_status?: string;
  default_task_offset_hours?: number;
}

export default function OrganizationSettings({ canEdit }: { canEdit: boolean }) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<OrgSettings>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/settings/org", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        if (data.logo_url) {
          setLogoPreview(data.logo_url);
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return settings.logo_url || null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const fileExt = logoFile.name.split(".").pop();
      const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
      const filePath = `org-logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("public")
        .upload(filePath, logoFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading logo:", uploadError);
        return null;
      }

      const { data } = supabase.storage.from("public").getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.error("Error uploading logo:", error);
      return null;
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let logoUrl = settings.logo_url;
      if (logoFile) {
        const uploadedUrl = await uploadLogo();
        if (uploadedUrl) {
          logoUrl = uploadedUrl;
        }
      }

      const response = await fetch("/api/settings/org", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...settings,
          logo_url: logoUrl,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setLogoFile(null);
        alert("Settings saved successfully!");
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Organization Settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Manage your business profile and default settings
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Name *
          </label>
          <input
            type="text"
            value={settings.business_name || ""}
            onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
            placeholder="Acme Roofing Company"
          />
        </div>

        {/* Logo Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Logo
          </label>
          <div className="flex items-center gap-4">
            {logoPreview && (
              <img
                src={logoPreview}
                alt="Logo preview"
                className="w-20 h-20 object-contain border border-gray-200 rounded"
              />
            )}
            <div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  disabled={!canEdit}
                  className="hidden"
                />
                <span className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-50 disabled:cursor-not-allowed">
                  <Upload className="h-4 w-4 mr-2" />
                  {logoPreview ? "Change Logo" : "Upload Logo"}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Industry */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Industry
          </label>
          <select
            value={settings.industry || "Roofing"}
            onChange={(e) => setSettings({ ...settings, industry: e.target.value })}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
          >
            <option value="Roofing">Roofing</option>
            <option value="Construction">Construction</option>
            <option value="Home Services">Home Services</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Business Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Address
          </label>
          <textarea
            value={settings.business_address || ""}
            onChange={(e) => setSettings({ ...settings, business_address: e.target.value })}
            disabled={!canEdit}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
            placeholder="123 Main St, City, State ZIP"
          />
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timezone
          </label>
          <select
            value={settings.timezone || "America/Los_Angeles"}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
          >
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="America/Denver">Mountain Time (MT)</option>
            <option value="America/Chicago">Central Time (CT)</option>
            <option value="America/New_York">Eastern Time (ET)</option>
          </select>
        </div>

        {/* Default Lead Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Lead Status
          </label>
          <select
            value={settings.default_lead_status || "new"}
            onChange={(e) => setSettings({ ...settings, default_lead_status: e.target.value })}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
          >
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="converted">Converted</option>
          </select>
        </div>

        {/* Default Task Offset */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Follow-up Duration (hours)
          </label>
          <input
            type="number"
            value={settings.default_task_offset_hours || 24}
            onChange={(e) =>
              setSettings({ ...settings, default_task_offset_hours: parseInt(e.target.value) })
            }
            disabled={!canEdit}
            min={1}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
          />
        </div>

        {/* Save Button */}
        {canEdit && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}





























































