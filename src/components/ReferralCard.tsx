"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface Profile {
  referral_code: string | null;
  referral_credits: number;
}

export default function ReferralCard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function fetchProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("referral_code, referral_credits")
          .eq("id", user.id)
          .maybeSingle();

        setProfile(profile);
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [supabase]);

  if (loading) {
    return (
      <div className="border rounded-xl p-4 space-y-3 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded w-full"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        <div className="h-10 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!profile?.referral_code) {
    return null; // Only show for Pro users with referral codes
  }

  const referralLink = `${window.location.origin}/ref/${profile.referral_code}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const redeemCredits = async () => {
    if (!profile.referral_credits || profile.referral_credits <= 0) return;
    
    setRedeeming(true);
    try {
      const response = await fetch("/api/referrals/redeem", { method: "POST" });
      if (response.ok) {
        // Refresh the page to show updated credits
        window.location.reload();
      } else {
        console.error("Failed to redeem credits");
      }
    } catch (error) {
      console.error("Error redeeming credits:", error);
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="border rounded-xl p-4 space-y-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
          <span className="text-white text-sm">🎁</span>
        </div>
        <h3 className="font-semibold text-gray-900">Refer Friends, Earn Credits</h3>
      </div>
      
      <p className="text-sm text-gray-600 leading-relaxed">
        Share your referral link with friends. They get <strong>+7 days free trial</strong>, 
        and you get <strong>+100 AI replies</strong> for every Pro signup!
      </p>

      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <input
            value={referralLink}
            readOnly
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white font-mono text-gray-700"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            onClick={copyToClipboard}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              copied
                ? "bg-green-500 text-white"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-blue-200">
        <div className="text-sm text-gray-600">
          <span className="font-medium">Credits available:</span>{" "}
          <span className="text-blue-600 font-bold">{profile.referral_credits || 0}</span>
        </div>
        
        {profile.referral_credits > 0 && (
          <button
            onClick={redeemCredits}
            disabled={redeeming}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-medium rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {redeeming ? "Redeeming..." : "Redeem Credits"}
          </button>
        )}
      </div>

      <div className="text-xs text-gray-500 bg-white/50 rounded-lg p-3">
        <p className="font-medium mb-1">How it works:</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-600">
          <li>Share your unique referral link</li>
          <li>Friends sign up with your link</li>
          <li>They get extended trial (+7 days)</li>
          <li>You earn 100 AI reply credits when they upgrade</li>
        </ol>
      </div>

      <div className="border-t border-blue-200 pt-3 mt-2">
        <a
          href="/dashboard/partners"
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          View Partner Dashboard →
        </a>
      </div>
    </div>
  );
} 