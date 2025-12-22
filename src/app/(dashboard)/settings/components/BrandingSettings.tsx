"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface BrandingSettingsProps {
  canEdit: boolean;
}

export default function BrandingSettings({ canEdit }: BrandingSettingsProps) {
  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#3b82f6");
  const [emailFooterHtml, setEmailFooterHtml] = useState("<p>Sent with <a href=\"https://smartsend.ai\">SmartSend</a></p>");
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
      
      if (data.settings?.branding) {
        setLogoUrl(data.settings.branding.logo_url || "");
        setAccentColor(data.settings.branding.accent_color || "#3b82f6");
        setEmailFooterHtml(data.settings.branding.email_footer_html || "<p>Sent with <a href=\"https://smartsend.ai\">SmartSend</a></p>");
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
      const res = await fetch("/api/settings/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branding: {
            logo_url: logoUrl || null,
            accent_color: accentColor,
            email_footer_html: emailFooterHtml,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Branding settings updated!");
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
        <h1 className="text-2xl font-semibold mb-2">Branding Settings</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Branding Settings</h1>
        <p className="text-sm text-gray-600">
          Customize your workspace branding for emails and UI
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Logo URL
          </label>
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            disabled={!canEdit}
          />
          <p className="mt-1 text-xs text-gray-500">
            URL to your workspace logo (stored in public.workspace_branding.logo_url)
          </p>
          {logoUrl && (
            <div className="mt-2">
              <img src={logoUrl} alt="Logo preview" className="h-16 object-contain" />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Accent Color
          </label>
          <div className="flex items-center gap-3">
            <Input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              disabled={!canEdit}
              className="w-20 h-10"
            />
            <Input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder="#3b82f6"
              disabled={!canEdit}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Used in email notifications, digest emails, and UI theme accents
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Footer HTML
          </label>
          <textarea
            value={emailFooterHtml}
            onChange={(e) => setEmailFooterHtml(e.target.value)}
            disabled={!canEdit}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            HTML content for email footers. Example: &lt;p&gt;—&lt;/p&gt;&lt;p&gt;&lt;strong&gt;Your Name&lt;/strong&gt;&lt;/p&gt;
          </p>
          <div className="mt-2 p-3 bg-gray-50 rounded border">
            <p className="text-xs font-medium text-gray-700 mb-1">Preview:</p>
            <div
              dangerouslySetInnerHTML={{ __html: emailFooterHtml }}
              className="text-sm text-gray-600"
            />
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








