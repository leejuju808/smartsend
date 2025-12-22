"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Upload } from "lucide-react";

interface BrandingSettingsProps {
  canEdit: boolean;
}

export default function BrandingSettings({ canEdit }: BrandingSettingsProps) {
  const [logoUrl, setLogoUrl] = useState("");
  const [brandPrimaryColor, setBrandPrimaryColor] = useState("#1E40AF");
  const [brandAccentColor, setBrandAccentColor] = useState("#3B82F6");
  const [buttonColor, setButtonColor] = useState("#2563EB");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/company/settings/branding");
      const data = await res.json();

      if (data) {
        setLogoUrl(data.logo_url || "");
        setBrandPrimaryColor(data.brand_primary_color || "#1E40AF");
        setBrandAccentColor(data.brand_accent_color || "#3B82F6");
        setButtonColor(data.button_color || "#2563EB");
      }
    } catch (error) {
      console.error("Failed to load branding:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/company/settings/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logo_url: logoUrl || null,
          brand_primary_color: brandPrimaryColor,
          brand_accent_color: brandAccentColor,
          button_color: buttonColor,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Branding saved!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // TODO: Implement actual file upload to storage
    // For now, just set a placeholder URL
    setMessage("Logo upload isn’t available in v1. Please paste an image URL for now.");
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Branding</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Branding</h1>
        <p className="text-sm text-gray-600">
          Customize your company logo and colors. Applied to scheduler page, email footer, booked appointment page, and contact forms.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Logo
          </label>
          {logoUrl && (
            <div className="mb-3">
              <img
                src={logoUrl}
                alt="Company logo"
                className="h-20 object-contain"
                onError={() => setLogoUrl("")}
              />
            </div>
          )}
          <div className="flex gap-3">
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              disabled={!canEdit}
              className="flex-1"
            />
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={!canEdit}
              className="hidden"
              id="logo-upload"
            />
            <label
              htmlFor="logo-upload"
              className={`px-4 py-2 border border-gray-300 rounded-md cursor-pointer ${
                canEdit
                  ? "hover:bg-gray-50"
                  : "opacity-50 cursor-not-allowed"
              }`}
            >
              <Upload className="h-4 w-4" />
            </label>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Upload your logo or paste an image URL. Recommended size: 200x50px
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Brand Primary Color
          </label>
          <div className="flex gap-3">
            <Input
              type="color"
              value={brandPrimaryColor}
              onChange={(e) => setBrandPrimaryColor(e.target.value)}
              disabled={!canEdit}
              className="w-20 h-10"
            />
            <Input
              value={brandPrimaryColor}
              onChange={(e) => setBrandPrimaryColor(e.target.value)}
              placeholder="#1E40AF"
              disabled={!canEdit}
              className="flex-1"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Brand Accent Color
          </label>
          <div className="flex gap-3">
            <Input
              type="color"
              value={brandAccentColor}
              onChange={(e) => setBrandAccentColor(e.target.value)}
              disabled={!canEdit}
              className="w-20 h-10"
            />
            <Input
              value={brandAccentColor}
              onChange={(e) => setBrandAccentColor(e.target.value)}
              placeholder="#3B82F6"
              disabled={!canEdit}
              className="flex-1"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Button Color (optional)
          </label>
          <div className="flex gap-3">
            <Input
              type="color"
              value={buttonColor}
              onChange={(e) => setButtonColor(e.target.value)}
              disabled={!canEdit}
              className="w-20 h-10"
            />
            <Input
              value={buttonColor}
              onChange={(e) => setButtonColor(e.target.value)}
              placeholder="#2563EB"
              disabled={!canEdit}
              className="flex-1"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Preview</h3>
          <div className="p-4 rounded-lg border" style={{ backgroundColor: brandPrimaryColor }}>
            <div className="flex items-center gap-3 mb-3">
              {logoUrl && (
                <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
              )}
              <span className="text-white font-semibold">Company Name</span>
            </div>
            <button
              className="px-4 py-2 rounded text-white font-medium"
              style={{ backgroundColor: buttonColor }}
            >
              Book Appointment
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`p-3 rounded-md ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-800"
                : "bg-green-50 text-green-800"
            }`}
          >
            {message}
          </div>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}





















































