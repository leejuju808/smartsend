"use client";

// Block 95000 — Coach Feed Page
// Shows today's top priority and coaching feed

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles, Target, BookOpen } from "lucide-react";

interface CoachingAction {
  key: string;
  description: string;
  points: number;
  score: number;
  trigger_type: string;
}

export default function CoachPage() {
  const [action, setAction] = useState<CoachingAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function fetchDailyAction() {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data, error: funcError } = await supabase.functions.invoke(
          "getDailyCoachingAction",
          {
            body: { user_id: user.id },
          }
        );

        if (funcError) {
          throw funcError;
        }

        if (data && !data.error) {
          setAction(data);
        }
      } catch (err: any) {
        console.error("Error fetching daily coaching action:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDailyAction();
  }, [router, supabase]);

  const handleComplete = async () => {
    if (!action) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Log the user action
      const { error } = await supabase.from("user_actions").insert({
        user_id: user.id,
        action_key: action.key,
        metadata: { completed: true, completed_at: new Date().toISOString() },
      });

      if (error) {
        throw error;
      }

      setCompleted(true);
      
      // Refresh the action after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      console.error("Error completing action:", err);
      alert("Failed to mark action as complete. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-zinc-800 rounded w-1/3"></div>
            <div className="h-64 bg-zinc-800 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!action) {
    return (
      <div className="min-h-screen bg-zinc-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400">No coaching action available at this time.</p>
            <Link href="/dashboard" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
              Return to Dashboard →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Your Daily Coach</h1>
            <p className="text-zinc-400">Your AI-powered guide to getting more jobs</p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-zinc-300"
          >
            ← Dashboard
          </Link>
        </div>

        {/* Today's Priority Card */}
        <div className="bg-gradient-to-r from-blue-500/20 via-blue-400/10 to-transparent border border-blue-500/40 rounded-xl p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <Target className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">
                  Today's Priority
                </span>
                <span className="px-2 py-0.5 bg-blue-500/20 rounded text-xs text-blue-300">
                  Score: {action.score}
                </span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">
                {action.description}
              </h2>
              
              {completed ? (
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Action completed! Refreshing...</span>
                </div>
              ) : (
                <button
                  onClick={handleComplete}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Mark as Complete
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Why It Matters */}
        <div className="bg-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            Why This Matters
          </h3>
          <div className="space-y-3 text-zinc-300">
            {action.key === "respond_to_hot_leads" && (
              <>
                <p>• Hot leads are your highest revenue opportunity. Every hour of delay reduces your close rate.</p>
                <p>• Fast response times (under 5 minutes) can increase conversion by 900%.</p>
                <p>• This is the #1 action that separates top performers from average roofers.</p>
              </>
            )}
            {action.key === "follow_up_old_leads" && (
              <>
                <p>• Old leads often come back to life with the right follow-up.</p>
                <p>• Many homeowners are just waiting for the right moment or reminder.</p>
                <p>• Consistent follow-up can recover 20-30% of "dead" leads.</p>
              </>
            )}
            {action.key === "send_daily_batch" && (
              <>
                <p>• Consistent daily outreach keeps your pipeline full.</p>
                <p>• Roofers who send daily get 3x more jobs than those who don't.</p>
                <p>• A full pipeline means you're never desperate for work.</p>
              </>
            )}
            {action.key === "personalize_opener" && (
              <>
                <p>• Personalized openers get 2-3x higher reply rates.</p>
                <p>• Generic emails get ignored. Personal touches get responses.</p>
                <p>• This small change can double your lead conversion.</p>
              </>
            )}
            {action.key === "complete_onboarding_step" && (
              <>
                <p>• Complete onboarding unlocks powerful features that save you time.</p>
                <p>• SmartSend gets smarter the more you configure it.</p>
                <p>• Set it up once, and it works for you forever.</p>
              </>
            )}
            {action.key === "check_campaign_health" && (
              <>
                <p>• Dead sequences waste your time and hurt your reputation.</p>
                <p>• Healthy campaigns bring in consistent leads.</p>
                <p>• Fix issues before they become problems.</p>
              </>
            )}
          </div>
        </div>

        {/* Step-by-Step Execution */}
        <div className="bg-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-blue-400" />
            Step-by-Step Execution
          </h3>
          <div className="space-y-4">
            {action.key === "respond_to_hot_leads" && (
              <div className="space-y-3 text-zinc-300">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">1</span>
                  <p>Go to your Inbox and find leads marked as "Hot"</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">2</span>
                  <p>Click on the first hot lead and read their message</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">3</span>
                  <p>Respond immediately with a helpful, personal message</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">4</span>
                  <p>Repeat for all hot leads (aim for under 5 minutes per response)</p>
                </div>
              </div>
            )}
            {action.key === "follow_up_old_leads" && (
              <div className="space-y-3 text-zinc-300">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">1</span>
                  <p>Go to your Leads page and filter by "No Reply" or "Stale"</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">2</span>
                  <p>Sort by oldest first to prioritize leads that need attention</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">3</span>
                  <p>Send a friendly follow-up asking if they're still interested</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">4</span>
                  <p>Offer value: "I noticed you were interested in [specific thing]. Still need help?"</p>
                </div>
              </div>
            )}
            {action.key === "send_daily_batch" && (
              <div className="space-y-3 text-zinc-300">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">1</span>
                  <p>Go to your Campaigns page</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">2</span>
                  <p>Review your active campaigns and check the send queue</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">3</span>
                  <p>Make sure your daily batch is scheduled and ready to send</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">4</span>
                  <p>If needed, add new leads to your campaigns to keep the pipeline full</p>
                </div>
              </div>
            )}
            {action.key === "personalize_opener" && (
              <div className="space-y-3 text-zinc-300">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">1</span>
                  <p>Go to your Campaign Templates</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">2</span>
                  <p>Open your first email template</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">3</span>
                  <p>Add a personal touch: mention their location, property type, or specific need</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">4</span>
                  <p>Use SmartSend's AI personalization features to automatically personalize at scale</p>
                </div>
              </div>
            )}
            {action.key === "complete_onboarding_step" && (
              <div className="space-y-3 text-zinc-300">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">1</span>
                  <p>Check your onboarding progress in Settings</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">2</span>
                  <p>Complete the next pending step</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">3</span>
                  <p>Each step unlocks new features that make SmartSend more powerful</p>
                </div>
              </div>
            )}
            {action.key === "check_campaign_health" && (
              <div className="space-y-3 text-zinc-300">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">1</span>
                  <p>Go to your Campaigns page</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">2</span>
                  <p>Review each campaign's performance metrics</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">3</span>
                  <p>Look for campaigns with low reply rates or high bounce rates</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-semibold">4</span>
                  <p>Fix issues: update templates, remove bad leads, adjust timing</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mini Tutorial from Playbook */}
        <div className="bg-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            Quick Tip from the Playbook
          </h3>
          <div className="text-zinc-300 space-y-2">
            {action.key === "respond_to_hot_leads" && (
              <p>
                <strong className="text-white">Pro Tip:</strong> Set up SmartSend notifications for hot leads. 
                When a homeowner replies with high intent, drop everything and respond within 5 minutes. 
                This single habit can double your close rate.
              </p>
            )}
            {action.key === "follow_up_old_leads" && (
              <p>
                <strong className="text-white">Pro Tip:</strong> Don't give up on old leads. 
                Many homeowners are just waiting for the right moment. Send a value-add follow-up 
                (like a seasonal tip or market update) instead of just asking "are you still interested?"
              </p>
            )}
            {action.key === "send_daily_batch" && (
              <p>
                <strong className="text-white">Pro Tip:</strong> Consistency beats intensity. 
                Sending 10 emails every day is better than sending 100 emails once a week. 
                Set up SmartSend to automatically send your daily batch so you never forget.
              </p>
            )}
            {action.key === "personalize_opener" && (
              <p>
                <strong className="text-white">Pro Tip:</strong> Use SmartSend's AI personalization 
                to automatically add personal touches to every email. Mention their neighborhood, 
                property type, or a recent event. Generic emails get deleted. Personal emails get replies.
              </p>
            )}
            {action.key === "complete_onboarding_step" && (
              <p>
                <strong className="text-white">Pro Tip:</strong> SmartSend gets more powerful 
                the more you configure it. Complete onboarding to unlock features like AI replies, 
                automated follow-ups, and lead scoring that save you hours every week.
              </p>
            )}
            {action.key === "check_campaign_health" && (
              <p>
                <strong className="text-white">Pro Tip:</strong> Check campaign health weekly. 
                Dead sequences hurt your sender reputation and waste your time. 
                Fix issues early, and your campaigns will run smoothly for months.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


























