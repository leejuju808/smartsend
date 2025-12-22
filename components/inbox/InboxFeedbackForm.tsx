// components/inbox/InboxFeedbackForm.tsx
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// Simple, non-annoying feedback form component

"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

type FeedbackTrigger =
  | "after_5th_use"
  | "after_first_booked"
  | "after_10_leads_replied"
  | "exit_inactivity"
  | "manual";

type FeedbackImprovement =
  | "faster_ui"
  | "better_ai_accuracy"
  | "more_filters"
  | "more_action_buttons"
  | "better_mobile_experience"
  | "other";

interface InboxFeedbackFormProps {
  trigger: FeedbackTrigger;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function InboxFeedbackForm({
  trigger,
  onClose,
  onSubmitted,
}: InboxFeedbackFormProps) {
  const [question1, setQuestion1] = useState("");
  const [question2, setQuestion2] = useState("");
  const [question3, setQuestion3] = useState<FeedbackImprovement | "">("");
  const [question3Other, setQuestion3Other] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch("/api/inbox/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trigger_moment: trigger,
          question_1_confusion: question1 || null,
          question_2_help: question2 || null,
          question_3_improvement: question3 || null,
          question_3_other_text:
            question3 === "other" ? question3Other : null,
        }),
      });

      if (response.ok) {
        onSubmitted?.();
        onClose();
      } else {
        console.error("Failed to submit feedback");
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Quick Feedback</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Question 1: Confusion */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What&apos;s one thing in the Inbox that confused you?
            </label>
            <textarea
              value={question1}
              onChange={(e) => setQuestion1(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              rows={2}
              placeholder="Optional..."
            />
          </div>

          {/* Question 2: Help */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What&apos;s one thing the Inbox helped you with this week?
            </label>
            <textarea
              value={question2}
              onChange={(e) => setQuestion2(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              rows={2}
              placeholder="Optional..."
            />
          </div>

          {/* Question 3: Improvement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What&apos;s one improvement you want next?
            </label>
            <select
              value={question3}
              onChange={(e) =>
                setQuestion3(e.target.value as FeedbackImprovement)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select one...</option>
              <option value="faster_ui">Faster UI</option>
              <option value="better_ai_accuracy">Better AI accuracy</option>
              <option value="more_filters">More filters</option>
              <option value="more_action_buttons">More action buttons</option>
              <option value="better_mobile_experience">
                Better mobile experience
              </option>
              <option value="other">Other</option>
            </select>

            {question3 === "other" && (
              <input
                type="text"
                value={question3Other}
                onChange={(e) => setQuestion3Other(e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Tell us more..."
              />
            )}
          </div>

          {/* Submit Button */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



















































