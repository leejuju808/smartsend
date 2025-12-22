"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Palette, Mail, Globe, Image as ImageIcon, Save } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

interface WhiteLabelSettingsClientProps {
  agencyId: string;
  agency: any;
  settings: any;
}

export function WhiteLabelSettingsClient({
  agencyId,
  agency,
  settings,
}: WhiteLabelSettingsClientProps) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // Brand Colors
    primary_color: settings?.primary_color || "",
    secondary_color: settings?.secondary_color || "",
    
    // Branding Assets
    portal_logo_url: settings?.portal_logo_url || "",
    email_logo_url: settings?.email_logo_url || "",
    
    // Email Branding
    email_from_name: settings?.email_from_name || agency?.name || "",
    email_from_address: settings?.email_from_address || "",
    support_email: settings?.support_email || "",
    
    // Portal Settings
    portal_title: settings?.portal_title || agency?.name || "",
    portal_favicon_url: settings?.portal_favicon_url || "",
    custom_domain: agency?.custom_domain || "",
    
    // Custom CSS (pros only)
    custom_css: settings?.custom_css || "",
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Upsert white-label settings
      const { error: settingsError } = await supabase
        .from("white_label_settings")
        .upsert({
          agency_id: agencyId,
          primary_color: formData.primary_color || null,
          secondary_color: formData.secondary_color || null,
          portal_logo_url: formData.portal_logo_url || null,
          email_logo_url: formData.email_logo_url || null,
          email_from_name: formData.email_from_name || null,
          email_from_address: formData.email_from_address || null,
          support_email: formData.support_email || null,
          portal_title: formData.portal_title || null,
          portal_favicon_url: formData.portal_favicon_url || null,
          custom_css: formData.custom_css || null,
        }, {
          onConflict: "agency_id",
        });

      if (settingsError) throw settingsError;

      // Update agency custom domain if changed
      if (formData.custom_domain !== agency?.custom_domain) {
        const { error: agencyError } = await supabase
          .from("agencies")
          .update({ custom_domain: formData.custom_domain || null })
          .eq("id", agencyId);

        if (agencyError) throw agencyError;
      }

      toast.success("White-label settings saved successfully!");
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error(error.message || "Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">White-Label Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Customize branding to make SmartSend look like your product
        </p>
      </div>

      {/* Brand Colors */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            <CardTitle>Brand Colors</CardTitle>
          </div>
          <CardDescription>
            Set your primary and secondary brand colors
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="primary_color">Primary Color</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="primary_color"
                  type="color"
                  value={formData.primary_color || "#000000"}
                  onChange={(e) => updateField("primary_color", e.target.value)}
                  className="w-20 h-10"
                />
                <Input
                  value={formData.primary_color}
                  onChange={(e) => updateField("primary_color", e.target.value)}
                  placeholder="#FF5733"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="secondary_color">Secondary Color</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="secondary_color"
                  type="color"
                  value={formData.secondary_color || "#000000"}
                  onChange={(e) => updateField("secondary_color", e.target.value)}
                  className="w-20 h-10"
                />
                <Input
                  value={formData.secondary_color}
                  onChange={(e) => updateField("secondary_color", e.target.value)}
                  placeholder="#33C3F0"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding Assets */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            <CardTitle>Branding Assets</CardTitle>
          </div>
          <CardDescription>
            Upload logos for portal and emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="portal_logo_url">Portal Logo URL</Label>
            <Input
              id="portal_logo_url"
              value={formData.portal_logo_url}
              onChange={(e) => updateField("portal_logo_url", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Logo displayed in portal header
            </p>
          </div>
          <div>
            <Label htmlFor="email_logo_url">Email Logo URL</Label>
            <Input
              id="email_logo_url"
              value={formData.email_logo_url}
              onChange={(e) => updateField("email_logo_url", e.target.value)}
              placeholder="https://example.com/email-logo.png"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Logo included in email templates
            </p>
          </div>
          <div>
            <Label htmlFor="portal_favicon_url">Favicon URL</Label>
            <Input
              id="portal_favicon_url"
              value={formData.portal_favicon_url}
              onChange={(e) => updateField("portal_favicon_url", e.target.value)}
              placeholder="https://example.com/favicon.ico"
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Branding */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            <CardTitle>Email Branding</CardTitle>
          </div>
          <CardDescription>
            Customize email sender information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email_from_name">From Name</Label>
            <Input
              id="email_from_name"
              value={formData.email_from_name}
              onChange={(e) => updateField("email_from_name", e.target.value)}
              placeholder="ABC Agency"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Name shown in email "From" field
            </p>
          </div>
          <div>
            <Label htmlFor="email_from_address">From Email Address</Label>
            <Input
              id="email_from_address"
              type="email"
              value={formData.email_from_address}
              onChange={(e) => updateField("email_from_address", e.target.value)}
              placeholder="noreply@abcagency.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Email address used for sending (must be verified)
            </p>
          </div>
          <div>
            <Label htmlFor="support_email">Support Email</Label>
            <Input
              id="support_email"
              type="email"
              value={formData.support_email}
              onChange={(e) => updateField("support_email", e.target.value)}
              placeholder="support@abcagency.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Support email shown to homeowners
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Portal Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            <CardTitle>Portal Settings</CardTitle>
          </div>
          <CardDescription>
            Configure portal title and custom domain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="portal_title">Portal Title</Label>
            <Input
              id="portal_title"
              value={formData.portal_title}
              onChange={(e) => updateField("portal_title", e.target.value)}
              placeholder="ABC Agency Portal"
            />
          </div>
          <div>
            <Label htmlFor="custom_domain">Custom Domain</Label>
            <Input
              id="custom_domain"
              value={formData.custom_domain}
              onChange={(e) => updateField("custom_domain", e.target.value)}
              placeholder="portal.abcagency.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Custom domain for white-label portal (requires DNS configuration)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Custom CSS (Advanced) */}
      <Card>
        <CardHeader>
          <CardTitle>Custom CSS (Advanced)</CardTitle>
          <CardDescription>
            Add custom CSS for advanced styling (pros only)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="custom_css">Custom CSS</Label>
            <Textarea
              id="custom_css"
              value={formData.custom_css}
              onChange={(e) => updateField("custom_css", e.target.value)}
              placeholder=".portal-header { background: #FF5733; }"
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Custom CSS will be applied to the portal
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading} size="lg">
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}



























