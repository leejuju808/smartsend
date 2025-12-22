"use client";

// Block 95000 — Daily Direction Banner
// Shows the ONE most important action the owner should take today

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

interface CoachingAction {
  key: string;
  description: string;
  points: number;
  score: number;
  trigger_type: string;
}

export function DailyDirectionBanner() {
  const [action, setAction] = useState<CoachingAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDailyAction() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        // Call the edge function
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
        } else {
          setError(data?.error || "Failed to load daily action");
        }
      } catch (err: any) {
        console.error("Error fetching daily coaching action:", err);
        setError(err.message || "Failed to load daily direction");
      } finally {
        setLoading(false);
      }
    }

    fetchDailyAction();
  }, []);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-blue-500/10 via-blue-400/5 to-transparent border border-blue-500/30 rounded-xl p-4 animate-pulse">
        <div className="h-6 bg-blue-500/20 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-blue-500/10 rounded w-1/2"></div>
      </div>
    );
  }

  if (error || !action) {
    return null; // Don't show banner if there's an error
  }

  return (
    <div className="bg-gradient-to-r from-blue-500/20 via-blue-400/10 to-transparent border border-blue-500/40 rounded-xl p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="mt-0.5">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-300 mb-1">
              Your Daily Direction
            </h3>
            <p className="text-sm text-zinc-200 leading-relaxed">
              {action.description}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              <span className="px-2 py-0.5 bg-blue-500/20 rounded text-blue-300">
                Priority Score: {action.score}
              </span>
            </div>
          </div>
        </div>
        <Link
          href={`/coach/${action.key}`}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
        >
          Do it now
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}


























