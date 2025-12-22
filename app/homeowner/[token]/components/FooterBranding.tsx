"use client";

import { useEffect, useState } from "react";
import { getCompanyWhiteLabelSettings } from "@/lib/agency/whiteLabel";

interface FooterBrandingProps {
  companyId?: string;
}

export function FooterBranding({ companyId }: FooterBrandingProps) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      getCompanyWhiteLabelSettings(companyId).then((s) => {
        setSettings(s);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [companyId]);

  if (loading) {
    return null;
  }

  // If white-label settings exist, show agency branding
  if (settings?.portal_title) {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-sm text-gray-500">
          {settings.portal_title}
        </p>
        {settings.support_email && (
          <p className="text-xs text-gray-400">
            Need help? <a href={`mailto:${settings.support_email}`} className="underline">
              {settings.support_email}
            </a>
          </p>
        )}
      </div>
    );
  }

  // Default SmartSend branding
  return (
    <div className="text-center py-8 space-y-2">
      <p className="text-sm text-gray-500">
        Powered by{" "}
        <span className="font-semibold text-gray-700">SmartSend</span>
      </p>
      <p className="text-xs text-gray-400">
        Your roofing company&apos;s customer portal
      </p>
    </div>
  );
}












