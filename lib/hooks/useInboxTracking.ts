// lib/hooks/useInboxTracking.ts
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// Hook for tracking inbox usage events

"use client";

import { useCallback, useEffect, useRef } from "react";

type InboxUsageEventType =
  | "thread_opened"
  | "action_button_clicked"
  | "setting_changed"
  | "notification_fired"
  | "ai_summary_viewed"
  | "inactivity_session"
  | "filter_applied"
  | "thread_selected"
  | "reply_sent"
  | "thread_closed"
  | "thread_snoozed"
  | "intent_manually_corrected"
  | "task_created"
  | "call_initiated"
  | "mark_as_booked";

interface TrackEventOptions {
  event_type: InboxUsageEventType;
  metadata?: Record<string, any>;
  thread_id?: string;
  campaign_id?: string;
}

export function useInboxTracking() {
  const sessionIdRef = useRef<string | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<Date>(new Date());

  // Generate session ID on mount
  useEffect(() => {
    sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Track session start
    trackEvent({
      event_type: "thread_opened",
      metadata: { session_start: true },
    });

    // Set up inactivity tracking
    const handleActivity = () => {
      lastActivityRef.current = new Date();
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      
      // Track inactivity if user opens inbox but does nothing for 5 minutes
      inactivityTimerRef.current = setTimeout(() => {
        trackEvent({
          event_type: "inactivity_session",
          metadata: {
            inactivity_duration_seconds: 300,
          },
        });
      }, 5 * 60 * 1000); // 5 minutes
    };

    // Listen for user activity
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("scroll", handleActivity);

    return () => {
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  const trackEvent = useCallback(async (options: TrackEventOptions) => {
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const platform = isMobile
        ? /iPhone|iPad|iPod/i.test(navigator.userAgent)
          ? "ios"
          : "android"
        : "web";

      await fetch("/api/inbox/tracking/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...options,
          session_id: sessionIdRef.current,
          is_mobile: isMobile,
          user_agent: navigator.userAgent,
          platform,
        }),
      });
    } catch (error) {
      // Silently fail - don't interrupt user experience
      console.error("Failed to track event:", error);
    }
  }, []);

  return {
    trackEvent,
    trackThreadOpened: useCallback(
      (threadId: string, campaignId?: string) => {
        trackEvent({
          event_type: "thread_opened",
          thread_id: threadId,
          campaign_id: campaignId,
        });
      },
      [trackEvent]
    ),
    trackActionButtonClicked: useCallback(
      (actionType: string, threadId?: string, campaignId?: string) => {
        trackEvent({
          event_type: "action_button_clicked",
          metadata: { action_type: actionType },
          thread_id: threadId,
          campaign_id: campaignId,
        });
      },
      [trackEvent]
    ),
    trackSettingChanged: useCallback(
      (settingName: string, oldValue: any, newValue: any) => {
        trackEvent({
          event_type: "setting_changed",
          metadata: {
            setting_name: settingName,
            old_value: oldValue,
            new_value: newValue,
          },
        });
      },
      [trackEvent]
    ),
    trackAISummaryViewed: useCallback(
      (threadId: string, summaryType: string) => {
        trackEvent({
          event_type: "ai_summary_viewed",
          thread_id: threadId,
          metadata: { summary_type: summaryType },
        });
      },
      [trackEvent]
    ),
    trackFilterApplied: useCallback(
      (filterType: string, filterValue: any) => {
        trackEvent({
          event_type: "filter_applied",
          metadata: {
            filter_type: filterType,
            filter_value: filterValue,
          },
        });
      },
      [trackEvent]
    ),
    trackThreadSelected: useCallback(
      (threadId: string, campaignId?: string) => {
        trackEvent({
          event_type: "thread_selected",
          thread_id: threadId,
          campaign_id: campaignId,
        });
      },
      [trackEvent]
    ),
    trackReplySent: useCallback(
      (threadId: string, campaignId?: string) => {
        trackEvent({
          event_type: "reply_sent",
          thread_id: threadId,
          campaign_id: campaignId,
        });
      },
      [trackEvent]
    ),
    trackThreadClosed: useCallback(
      (threadId: string, campaignId?: string) => {
        trackEvent({
          event_type: "thread_closed",
          thread_id: threadId,
          campaign_id: campaignId,
        });
      },
      [trackEvent]
    ),
    trackThreadSnoozed: useCallback(
      (threadId: string, campaignId?: string) => {
        trackEvent({
          event_type: "thread_snoozed",
          thread_id: threadId,
          campaign_id: campaignId,
        });
      },
      [trackEvent]
    ),
    trackIntentManuallyCorrected: useCallback(
      (threadId: string, oldIntent: string, newIntent: string) => {
        trackEvent({
          event_type: "intent_manually_corrected",
          thread_id: threadId,
          metadata: {
            old_intent: oldIntent,
            new_intent: newIntent,
          },
        });
      },
      [trackEvent]
    ),
    trackTaskCreated: useCallback(
      (threadId: string, taskType: string) => {
        trackEvent({
          event_type: "task_created",
          thread_id: threadId,
          metadata: { task_type: taskType },
        });
      },
      [trackEvent]
    ),
    trackCallInitiated: useCallback(
      (threadId: string, campaignId?: string) => {
        trackEvent({
          event_type: "call_initiated",
          thread_id: threadId,
          campaign_id: campaignId,
        });
      },
      [trackEvent]
    ),
    trackMarkAsBooked: useCallback(
      (threadId: string, campaignId?: string, jobValue?: number) => {
        trackEvent({
          event_type: "mark_as_booked",
          thread_id: threadId,
          campaign_id: campaignId,
          metadata: { job_value: jobValue },
        });
      },
      [trackEvent]
    ),
  };
}



















































