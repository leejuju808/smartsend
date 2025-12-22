"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { X, Sparkles } from "lucide-react";

interface CoachingPrompt {
  id: string;
  type: string;
  title: string;
  message: string;
  actionButton: string;
  actionUrl: string;
}

export function CoachingBanner() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [prompt, setPrompt] = useState<CoachingPrompt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCoachingPrompt = async () => {
      try {
        const res = await fetch("/api/coaching/prompt");
        if (res.ok) {
          const data = await res.json();
          if (data && data.title) {
            setPrompt(data);
            setShow(true);
          }
        }
      } catch (error) {
        console.error("Error fetching coaching prompt:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCoachingPrompt();
  }, []);

  const handleAction = () => {
    if (prompt?.actionUrl) {
      router.push(prompt.actionUrl);
    }
  };

  if (loading || !show || !prompt) return null;

  // Different styles based on prompt type
  const getBannerStyles = () => {
    switch (prompt.type) {
      case "onboarding_step":
        return {
          bg: "bg-blue-50",
          border: "border-blue-200",
          text: "text-blue-900",
          textMuted: "text-blue-800",
          button: "bg-blue-600 hover:bg-blue-700",
          icon: "text-blue-600",
        };
      case "hot_leads":
        return {
          bg: "bg-emerald-50",
          border: "border-emerald-200",
          text: "text-emerald-900",
          textMuted: "text-emerald-800",
          button: "bg-emerald-600 hover:bg-emerald-700",
          icon: "text-emerald-600",
        };
      case "no_replies":
        return {
          bg: "bg-amber-50",
          border: "border-amber-200",
          text: "text-amber-900",
          textMuted: "text-amber-800",
          button: "bg-amber-600 hover:bg-amber-700",
          icon: "text-amber-600",
        };
      default:
        return {
          bg: "bg-indigo-50",
          border: "border-indigo-200",
          text: "text-indigo-900",
          textMuted: "text-indigo-800",
          button: "bg-indigo-600 hover:bg-indigo-700",
          icon: "text-indigo-600",
        };
    }
  };

  const styles = getBannerStyles();

  return (
    <div className={`p-4 ${styles.bg} border ${styles.border} rounded-lg mb-4 relative`}>
      <button
        onClick={() => setShow(false)}
        className={`absolute top-2 right-2 ${styles.icon} hover:opacity-70 transition-opacity`}
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="pr-8 flex items-start gap-3">
        <Sparkles className={`w-5 h-5 ${styles.icon} mt-0.5 flex-shrink-0`} />
        <div className="flex-1">
          <p className={`font-semibold ${styles.text} mb-1`}>
            {prompt.title}
          </p>
          <p className={`text-sm ${styles.textMuted} mb-3`}>
            {prompt.message}
          </p>
          {prompt.actionButton && prompt.actionUrl && (
            <Button
              onClick={handleAction}
              className={`${styles.button} text-white`}
              size="sm"
            >
              {prompt.actionButton}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


























