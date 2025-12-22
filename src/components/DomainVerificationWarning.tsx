"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ExclamationTriangleIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { createClientComponentClient } from "@/lib/supabase";

interface DomainVerificationWarningProps {
  fromEmail?: string;
  className?: string;
}

export default function DomainVerificationWarning({ fromEmail, className = "" }: DomainVerificationWarningProps) {
  const [verificationStatus, setVerificationStatus] = useState<{
    verified: boolean;
    domain: string | null;
    lastCheck?: any;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (!fromEmail) {
      setLoading(false);
      return;
    }

    checkDomainVerification();
  }, [fromEmail]);

  const checkDomainVerification = async () => {
    try {
      // Extract domain from email
      const domain = fromEmail?.split("@")[1]?.toLowerCase();
      if (!domain) {
        setVerificationStatus({ verified: false, domain: null });
        setLoading(false);
        return;
      }

      // Check verification status
      const { data, error } = await supabase
        .from("sender_domains")
        .select("verified, domain, last_check")
        .eq("domain", domain)
        .maybeSingle();

      if (error) {
        console.error("Error checking domain verification:", error);
        setVerificationStatus({ verified: false, domain });
      } else {
        setVerificationStatus({
          verified: data?.verified || false,
          domain,
          lastCheck: data?.last_check
        });
      }
    } catch (error) {
      console.error("Error in domain verification check:", error);
      setVerificationStatus({ verified: false, domain: fromEmail?.split("@")[1] || null });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-100 rounded-lg p-4 ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (!fromEmail || !verificationStatus?.domain) {
    return null;
  }

  if (verificationStatus.verified) {
    return (
      <div className={`bg-green-50 border border-green-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2">
          <CheckCircleIcon className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-800">
            Domain {verificationStatus.domain} is verified ✓
          </span>
        </div>
        <p className="text-xs text-green-700 mt-1">
          Your emails will have optimal deliverability
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-yellow-50 border border-yellow-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-start space-x-3">
        <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-yellow-800">
              Domain {verificationStatus.domain} needs verification
            </h4>
            <Link
              href="/dashboard/domain-setup"
              className="text-xs text-yellow-700 underline hover:text-yellow-800"
            >
              Fix Now
            </Link>
          </div>
          <p className="text-xs text-yellow-700 mt-1">
            Unverified domains may cause emails to go to spam. 
            <Link href="/dashboard/domain-setup" className="underline ml-1">
              Set up DNS records
            </Link>{" "}
            for optimal deliverability.
          </p>
          
          {verificationStatus.lastCheck && (
            <div className="mt-2 text-xs text-yellow-600">
              <p className="font-medium">Last check results:</p>
              <ul className="mt-1 space-y-1">
                {Object.entries(verificationStatus.lastCheck).map(([key, value]: [string, any]) => (
                  <li key={key} className="flex items-center space-x-2">
                    <span className="capitalize">{key}:</span>
                    <span className={value.ok ? "text-green-600" : "text-red-600"}>
                      {value.ok ? "✓" : "✗"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 