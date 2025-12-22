// lib/hooks/useInboxFeedbackTriggers.ts
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// Hook for managing feedback form trigger logic

"use client";

import { useState, useEffect, useCallback } from "react";

type FeedbackTrigger =
  | "after_5th_use"
  | "after_first_booked"
  | "after_10_leads_replied"
  | "exit_inactivity"
  | "manual";

export function useInboxFeedbackTriggers() {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackTrigger, setFeedbackTrigger] =
    useState<FeedbackTrigger | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [bookedCount, setBookedCount] = useState(0);
  const [repliedLeadsCount, setRepliedLeadsCount] = useState(0);
  const [hasShownFeedback, setHasShownFeedback] = useState(false);

  // Load usage counts from localStorage
  useEffect(() => {
    const storedUsageCount = localStorage.getItem("inbox_usage_count");
    const storedBookedCount = localStorage.getItem("inbox_booked_count");
    const storedRepliedLeadsCount = localStorage.getItem(
      "inbox_replied_leads_count"
    );
    const storedHasShownFeedback = localStorage.getItem(
      "inbox_has_shown_feedback"
    );

    if (storedUsageCount) {
      setUsageCount(parseInt(storedUsageCount, 10));
    }
    if (storedBookedCount) {
      setBookedCount(parseInt(storedBookedCount, 10));
    }
    if (storedRepliedLeadsCount) {
      setRepliedLeadsCount(parseInt(storedRepliedLeadsCount, 10));
    }
    if (storedHasShownFeedback === "true") {
      setHasShownFeedback(true);
    }
  }, []);

  // Track inbox usage
  const trackInboxUsage = useCallback(() => {
    const newCount = usageCount + 1;
    setUsageCount(newCount);
    localStorage.setItem("inbox_usage_count", newCount.toString());

    // Trigger after 5th use
    if (newCount === 5 && !hasShownFeedback) {
      setFeedbackTrigger("after_5th_use");
      setShowFeedback(true);
      setHasShownFeedback(true);
      localStorage.setItem("inbox_has_shown_feedback", "true");
    }
  }, [usageCount, hasShownFeedback]);

  // Track booked estimate
  const trackBookedEstimate = useCallback(() => {
    const newCount = bookedCount + 1;
    setBookedCount(newCount);
    localStorage.setItem("inbox_booked_count", newCount.toString());

    // Trigger after first booked
    if (newCount === 1 && !hasShownFeedback) {
      setFeedbackTrigger("after_first_booked");
      setShowFeedback(true);
      setHasShownFeedback(true);
      localStorage.setItem("inbox_has_shown_feedback", "true");
    }
  }, [bookedCount, hasShownFeedback]);

  // Track replied leads
  const trackRepliedLead = useCallback(() => {
    const newCount = repliedLeadsCount + 1;
    setRepliedLeadsCount(newCount);
    localStorage.setItem("inbox_replied_leads_count", newCount.toString());

    // Trigger after 10 leads receive replies
    if (newCount === 10 && !hasShownFeedback) {
      setFeedbackTrigger("after_10_leads_replied");
      setShowFeedback(true);
      setHasShownFeedback(true);
      localStorage.setItem("inbox_has_shown_feedback", "true");
    }
  }, [repliedLeadsCount, hasShownFeedback]);

  // Track exit inactivity (called when user exits without action)
  const trackExitInactivity = useCallback(() => {
    if (!hasShownFeedback) {
      setFeedbackTrigger("exit_inactivity");
      setShowFeedback(true);
      setHasShownFeedback(true);
      localStorage.setItem("inbox_has_shown_feedback", "true");
    }
  }, [hasShownFeedback]);

  // Manual trigger
  const triggerFeedback = useCallback((trigger: FeedbackTrigger = "manual") => {
    setFeedbackTrigger(trigger);
    setShowFeedback(true);
  }, []);

  const closeFeedback = useCallback(() => {
    setShowFeedback(false);
    setFeedbackTrigger(null);
  }, []);

  return {
    showFeedback,
    feedbackTrigger,
    trackInboxUsage,
    trackBookedEstimate,
    trackRepliedLead,
    trackExitInactivity,
    triggerFeedback,
    closeFeedback,
  };
}



















































