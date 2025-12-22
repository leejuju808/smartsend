"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface CompanyInfoSettingsProps {
  canEdit: boolean;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default function CompanyInfoSettings({ canEdit }: CompanyInfoSettingsProps) {
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [insuranceInfo, setInsuranceInfo] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/company/settings");
      const data = await res.json();

      if (data.settings) {
        setCompanyName(data.settings.company_name || "");
        setOwnerName(data.settings.owner_name || "");
        setCompanyPhone(data.settings.company_phone || "");
        setCompanyEmail(data.settings.company_email || "");
        setWebsite(data.settings.website || "");
        setAddress(data.settings.address || "");
        setTimezone(data.settings.timezone || "America/New_York");
        setLicenseNumber(data.settings.license_number || "");
        setInsuranceInfo(data.settings.insurance_info || "");
        setServiceType(data.settings.service_type || "");
      }
    } catch (error) {
      console.error("Failed to load company info:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/company/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "info",
          data: {
            company_name: companyName,
            owner_name: ownerName,
            company_phone: companyPhone,
            company_email: companyEmail,
            website: website || null,
            address: address || null,
            timezone,
            license_number: licenseNumber || null,
            insurance_info: insuranceInfo || null,
            service_type: serviceType || null,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Company info saved!");
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
        <h1 className="text-2xl font-semibold mb-2">Company Info</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Company Info</h1>
        <p className="text-sm text-gray-600">
          Manage your company identity and contact information
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Name <span className="text-red-500">*</span>
          </label>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Summit Roofing Co."
            disabled={!canEdit}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Owner Name <span className="text-red-500">*</span>
          </label>
          <Input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="John Smith"
            disabled={!canEdit}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Phone <span className="text-red-500">*</span>
          </label>
          <Input
            type="tel"
            value={companyPhone}
            onChange={(e) => setCompanyPhone(e.target.value)}
            placeholder="(555) 123-4567"
            disabled={!canEdit}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Email <span className="text-red-500">*</span>
          </label>
          <Input
            type="email"
            value={companyEmail}
            onChange={(e) => setCompanyEmail(e.target.value)}
            placeholder="info@summitroofing.com"
            disabled={!canEdit}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Website (optional)
          </label>
          <Input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://summitroofing.com"
            disabled={!canEdit}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Address (optional)
          </label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Tacoma, WA 98401"
            disabled={!canEdit}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timezone <span className="text-red-500">*</span>
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("_", " ")}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Critical for scheduler, follow-up timing, sending timing, and reporting
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            License # (optional)
          </label>
          <Input
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="WA-12345"
            disabled={!canEdit}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Insurance Info (optional)
          </label>
          <Input
            value={insuranceInfo}
            onChange={(e) => setInsuranceInfo(e.target.value)}
            placeholder="General Liability: $1M"
            disabled={!canEdit}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Service Type (optional)
          </label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="">Select service type</option>
            <option value="Roofing">Roofing</option>
            <option value="General Contractor">General Contractor</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            These flow into personalization, email footer, invoice headers (future)
          </p>
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
            <Button onClick={handleSave} disabled={saving || !companyName || !ownerName || !companyPhone || !companyEmail}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

