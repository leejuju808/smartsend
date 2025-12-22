"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { CheckCircle2, Circle, Mail, Users, MessageSquare } from "lucide-react";

export default function OnboardingWizard() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, []);

  const next = async () => {
    if (step === 3) {
      // Complete onboarding
      setLoading(true);
      try {
        if (userId) {
          await supabase
            .from("profiles")
            .update({ onboarding_complete: true, progress_percent: 100 })
            .eq("id", userId);
        }
        router.push("/dashboard/campaigns/new");
      } catch (error) {
        console.error("Error completing onboarding:", error);
        setLoading(false);
      }
      return;
    }
    setStep((s) => s + 1);
  };

  const goToStep = (s: number) => {
    if (s <= step) setStep(s);
  };

  const connectGmail = () => {
    if (!userId) return;
    window.location.href = `/api/mail/gmail/start?userId=${userId}`;
  };

  const connectOutlook = () => {
    if (!userId) return;
    window.location.href = `/api/auth/start/outlook?userId=${userId}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
          <h1 className="text-3xl font-bold text-white">Welcome to SmartSend ⚡</h1>
          <p className="text-blue-100 mt-2">Let's get you set up in just 3 steps</p>
        </div>

        {/* Progress Steps */}
        <div className="px-8 py-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <button
                  onClick={() => goToStep(s)}
                  className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                    s === step
                      ? "bg-indigo-600 text-white scale-110"
                      : s < step
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {s < step ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </button>
                {s < 3 && (
                  <div
                    className={`flex-1 h-1 mx-2 transition-all ${
                      s < step ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="px-8 py-8">
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Mail className="w-8 h-8 text-indigo-600" />
                <h2 className="text-2xl font-semibold">Connect Your Email Account</h2>
              </div>
              <p className="text-gray-600">
                Connect your Gmail or Outlook account to start sending automated outreach campaigns.
              </p>
              <div className="grid md:grid-cols-2 gap-4 mt-6">
                <button
                  onClick={connectGmail}
                  className="p-6 rounded-xl border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                      <Mail className="text-red-600" size={20} />
                    </div>
                    <span className="font-semibold">Gmail</span>
                  </div>
                  <p className="text-sm text-gray-600">Connect with Google OAuth</p>
                </button>
                <button
                  onClick={connectOutlook}
                  className="p-6 rounded-xl border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Mail className="text-blue-600" size={20} />
                    </div>
                    <span className="font-semibold">Outlook</span>
                  </div>
                  <p className="text-sm text-gray-600">Connect with Microsoft</p>
                </button>
              </div>
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  ✨ Once connected, you can send up to 50 emails per day for free!
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-indigo-600" />
                <h2 className="text-2xl font-semibold">Import Your First Leads</h2>
              </div>
              <p className="text-gray-600">
                Import at least 10 leads from a CSV file to start your first campaign.
              </p>
              <div className="mt-6 p-6 border-2 border-dashed border-gray-300 rounded-xl text-center">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">
                  Upload a CSV with email addresses to import your contacts
                </p>
                <Button
                  onClick={() => router.push("/leads/import")}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  Import Leads Now
                </Button>
              </div>
              <div className="mt-6 p-4 bg-amber-50 rounded-lg">
                <p className="text-sm text-amber-800">
                  📊 Your CSV should include: email, first_name, last_name, company
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-8 h-8 text-indigo-600" />
                <h2 className="text-2xl font-semibold">Compose Your First Campaign</h2>
              </div>
              <p className="text-gray-600">
                Use AI-powered Smart Templates to create high-converting outreach emails in seconds.
              </p>
              <div className="mt-6 p-6 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-200">
                <h3 className="font-semibold text-indigo-900 mb-3">🚀 You're almost ready!</h3>
                <p className="text-indigo-800 mb-4">
                  In the next step, you'll create your first campaign using our AI-powered template
                  system.
                </p>
                <ul className="space-y-2 text-sm text-indigo-700">
                  <li>✓ Personalized email generation</li>
                  <li>✓ Smart follow-up sequences</li>
                  <li>✓ Real-time engagement tracking</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-8 py-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
            >
              Back
            </Button>
          )}
          {step === 1 && <div />}
          <Button
            onClick={next}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 ml-auto"
          >
            {loading ? "Loading..." : step === 3 ? "Launch Campaign →" : "Next →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

