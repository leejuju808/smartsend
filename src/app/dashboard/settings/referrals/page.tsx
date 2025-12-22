"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Copy, CheckCircle } from "lucide-react";

interface Referral {
  id: string;
  referred_email: string;
  status: "pending" | "activated" | "rewarded";
  reward_amount: number;
  created_at: string;
}

export default function ReferralsPage() {
  const supabase = createClientComponentClient();
  const [refLink, setRefLink] = useState("");
  const [stats, setStats] = useState<Referral[]>([]);
  const [referralCredits, setReferralCredits] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReferralData();
  }, [supabase]);

  const loadReferralData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Generate referral link using user ID
      const baseUrl = typeof window !== "undefined" 
        ? window.location.origin 
        : "https://smartsendhq.com";
      const referralUrl = `${baseUrl}/signup?ref=${user.id}`;
      setRefLink(referralUrl);

      // Load referral stats
      const { data: referrals, error } = await supabase
        .from("referrals")
        .select("*")
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading referrals:", error);
      } else {
        setStats(referrals || []);
      }

      // Load referral credits
      const { data: profile } = await supabase
        .from("profiles")
        .select("referral_credits")
        .eq("id", user.id)
        .single();

      if (profile?.referral_credits !== undefined) {
        setReferralCredits(profile.referral_credits);
      }
    } catch (error) {
      console.error("Error loading referral data:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  const statsSummary = {
    total: stats.length,
    activated: stats.filter((r) => r.status === "activated" || r.status === "rewarded").length,
    pending: stats.filter((r) => r.status === "pending").length,
    totalRewards: stats.reduce((sum, r) => sum + (r.reward_amount || 0), 0),
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Referral Program ⚡</h1>
        <p className="text-sm text-muted-foreground">
          Share SmartSend with others and earn $10 credit per activation.
        </p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded-xl p-4 bg-muted/30">
          <div className="text-2xl font-bold">{statsSummary.total}</div>
          <div className="text-sm text-muted-foreground">Total Referrals</div>
        </div>
        <div className="border rounded-xl p-4 bg-muted/30">
          <div className="text-2xl font-bold text-green-600">{statsSummary.activated}</div>
          <div className="text-sm text-muted-foreground">Activated</div>
        </div>
        <div className="border rounded-xl p-4 bg-muted/30">
          <div className="text-2xl font-bold text-yellow-600">{statsSummary.pending}</div>
          <div className="text-sm text-muted-foreground">Pending</div>
        </div>
        <div className="border rounded-xl p-4 bg-muted/30">
          <div className="text-2xl font-bold">${statsSummary.totalRewards.toFixed(2)}</div>
          <div className="text-sm text-muted-foreground">Total Earned</div>
        </div>
      </div>

      {/* Referral Link */}
      <div className="border p-4 rounded-xl bg-muted/30">
        <p className="text-sm font-medium mb-2">Your Referral Link</p>
        <div className="flex gap-2">
          <input
            value={refLink}
            readOnly
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background"
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition flex items-center gap-2"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Share this link with friends. When they sign up and complete onboarding, you'll earn $10 in credits.
        </p>
      </div>

      {/* Referral Credits Display */}
      {referralCredits > 0 && (
        <div className="border rounded-xl p-4 bg-green-50 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-green-900">Your Referral Credits</p>
              <p className="text-2xl font-bold text-green-600">${referralCredits.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Referrals List */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Your Referrals</h2>
        {stats.length === 0 ? (
          <div className="border rounded-xl p-8 text-center text-muted-foreground">
            <p>No referrals yet. Share your link to start earning!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.map((r) => (
              <div
                key={r.id}
                className="flex justify-between items-center border rounded-xl p-3 text-sm"
              >
                <div className="flex-1">
                  <span className="font-medium">{r.referred_email}</span>
                  {r.reward_amount > 0 && (
                    <span className="ml-2 text-green-600">+${r.reward_amount.toFixed(2)}</span>
                  )}
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    r.status === "rewarded" || r.status === "activated"
                      ? "bg-green-100 text-green-700"
                      : r.status === "pending"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

