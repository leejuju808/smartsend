"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Gift } from "lucide-react";
import { toast } from "sonner";

interface ReferralSectionProps {
  portalToken: string;
  jobId: string;
}

export function ReferralSection({ portalToken, jobId }: ReferralSectionProps) {
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReferralLink = async () => {
      try {
        const response = await fetch(`/api/referrals/portal-link?portalToken=${portalToken}`);
        if (response.ok) {
          const data = await response.json();
          if (data.referralLink) {
            const fullUrl = `${window.location.origin}/refer/${data.referralLink.ref_code}`;
            setReferralLink(fullUrl);
          }
        }
      } catch (error) {
        console.error("Error fetching referral link:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReferralLink();
  }, [portalToken]);

  const handleCopy = async () => {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Share & Earn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!referralLink) {
    return null; // Don't show if no referral link exists
  }

  return (
    <Card className="border-2 border-green-200 bg-green-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-800">
          <Gift className="h-5 w-5" />
          Share & Earn
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-700">
          Know anyone who needs roofing help? Share this link — they get a discount, and you earn a reward!
        </p>
        
        <div className="flex items-center gap-2">
          <div className="flex-1 p-2 bg-white border rounded-md text-sm font-mono truncate">
            {referralLink}
          </div>
          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            className="shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-gray-600">
          When someone uses your link to get a quote, you'll both receive rewards!
        </p>
      </CardContent>
    </Card>
  );
}



























