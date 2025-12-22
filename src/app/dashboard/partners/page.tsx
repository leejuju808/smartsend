"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Clipboard, Check, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function PartnerDashboard() {
  const [partner, setPartner] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/partners/me");
        if (!res.ok) {
          if (res.status === 404) {
            // Not a partner yet
            setLoading(false);
            return;
          }
          throw new Error("Failed to fetch partner data");
        }
        const j = await res.json();
        setPartner(j.partner);
        setPayouts(j.payouts || []);
      } catch (error) {
        console.error("Error fetching partner data:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const joinPartnerProgram = async () => {
    try {
      const res = await fetch("/api/partners/join", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setPartner({
          referral_code: data.code,
          role: data.role,
          commission_rate: data.commission_rate,
          total_earned: 0
        });
      }
    } catch (error) {
      console.error("Error joining partner program:", error);
    }
  };

  const copyReferralLink = async () => {
    if (!partner) return;
    const link = `${window.location.origin}/signup?ref=${partner.referral_code}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const referralLink = partner ? `${window.location.origin}/signup?ref=${partner.referral_code}` : '';

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Partner Program ⚡</h1>
          <p className="text-gray-600 mt-2">
            Earn commission on every referral who converts to a paid plan
          </p>
        </div>

        <Card className="p-6 border-2 border-dashed">
          <div className="text-center space-y-4">
            <p className="text-lg font-semibold">Join the Partner Program</p>
            <p className="text-gray-600">
              Get a unique referral link and earn {20}% commission on every successful conversion
            </p>
            <button 
              onClick={joinPartnerProgram}
              className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-semibold"
            >
              Become a Partner ⚡
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Partner Dashboard ⚡</h1>
        <p className="text-gray-600">Track your earnings and manage payouts</p>
      </div>

      {partner && (
        <>
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">Referral Code</p>
                <p className="text-lg font-bold">{partner.referral_code}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Earned</p>
                <p className="text-lg font-bold">${(partner.total_earned || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Commission</p>
                <p className="text-lg font-bold">{((partner.commission_rate || 0.20) * 100).toFixed(0)}%</p>
              </div>
            </div>

            {/* Referral Link */}
            <div className="border-t pt-4">
              <p className="text-sm text-gray-500 mb-2">Your referral link</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={referralLink}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
                />
                <button
                  onClick={copyReferralLink}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-green-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Clipboard className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Share this link to earn commissions when referrals convert to paid plans
              </p>
            </div>
          </Card>

          {/* Payouts Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Payouts</h3>
            {payouts.length === 0 ? (
              <Card className="p-6 text-center text-gray-500">
                No payouts yet. Start referring to earn commissions!
              </Card>
            ) : (
              <div className="space-y-2">
                {payouts.map((p: any) => (
                  <Card key={p.id} className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{p.period}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xl font-bold">${parseFloat(p.amount).toFixed(2)}</span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            p.status === "paid"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Payouts</p>
              <p className="text-2xl font-bold">
                {payouts.reduce((sum, p) => sum + (p.status === 'paid' ? parseFloat(p.amount) : 0), 0).toFixed(2)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold">
                ${payouts.reduce((sum, p) => sum + (p.status === 'pending' ? parseFloat(p.amount) : 0), 0).toFixed(2)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Payout History</p>
              <p className="text-2xl font-bold">{payouts.length}</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

