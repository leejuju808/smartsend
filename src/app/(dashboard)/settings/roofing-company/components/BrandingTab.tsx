"use client";

import { useState, useEffect } from "react";
import { Palette, Save, Upload } from "lucide-react";

interface BrandingTabProps {
  roofingCompanyId: string;
  canEdit: boolean;
}

export default function BrandingTab({ roofingCompanyId, canEdit }: BrandingTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    logo_url: "",
    primary_color: "#1E40AF",
    secondary_color: "#3B82F6",
    email_signature: "",
    login_background_url: "",
  });

  useEffect(() => {
    loadBranding();
  }, [roofingCompanyId]);

  const loadBranding = async () => {
    try {
      const response = await fetch(`/api/company/branding/get?roofing_company_id=${roofingCompanyId}`);
      const data = await response.json();
      if (data.success && data.branding) {
        setFormData({
          logo_url: data.branding.logo_url || "",
          primary_color: data.branding.primary_color || "#1E40AF",
          secondary_color: data.branding.secondary_color || "#3B82F6",
          email_signature: data.branding.email_signature || "",
          login_background_url: data.branding.login_background_url || "",
        });
      }
    } catch (error) {
      console.error("Error loading branding:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    try {
      const response = await fetch("/api/company/branding/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roofing_company_id: roofingCompanyId,
          ...formData,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Branding updated successfully!");
      } else {
        alert(data.error || "Failed to update branding");
      }
    } catch (error) {
      console.error("Error saving:", error);
      alert("Failed to update branding");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading branding settings...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center">
          <Palette className="w-6 h-6 text-gray-600 mr-3" />
          <h2 className="text-xl font-semibold text-gray-900">Branding</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">Customize your company branding</p>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Logo URL
          </label>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
              disabled={!canEdit}
              placeholder="https://example.com/logo.png"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
            />
            <button
              disabled={!canEdit}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </button>
          </div>
          {formData.logo_url && (
            <div className="mt-2">
              <img src={formData.logo_url} alt="Logo preview" className="h-16 w-auto" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Primary Color
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={formData.primary_color}
                onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                disabled={!canEdit}
                className="h-10 w-20 border border-gray-300 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <input
                type="text"
                value={formData.primary_color}
                onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                disabled={!canEdit}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Secondary Color
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={formData.secondary_color}
                onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                disabled={!canEdit}
                className="h-10 w-20 border border-gray-300 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <input
                type="text"
                value={formData.secondary_color}
                onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                disabled={!canEdit}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Signature
          </label>
          <textarea
            value={formData.email_signature}
            onChange={(e) => setFormData({ ...formData, email_signature: e.target.value })}
            disabled={!canEdit}
            rows={4}
            placeholder="Best regards,&#10;{{company_name}}&#10;{{company_phone}}"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
          />
          <p className="text-xs text-gray-500 mt-1">
            Use variables: {"{"}{"{"}company_name{"}"}{"}"}, {"{"}{"{"}company_phone{"}"}{"}"}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Login Background URL (Optional)
          </label>
          <input
            type="text"
            value={formData.login_background_url}
            onChange={(e) => setFormData({ ...formData, login_background_url: e.target.value })}
            disabled={!canEdit}
            placeholder="https://example.com/background.jpg"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
          />
        </div>

        {canEdit && (
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

























