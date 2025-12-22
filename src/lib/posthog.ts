'use client'

// Lazy import PostHog to avoid errors if not installed
let posthog: any = null

if (typeof window !== 'undefined') {
  try {
    const ph = require('posthog-js')
    posthog = ph.default || ph
  } catch (error) {
    // PostHog not installed
  }
}

/**
 * Track events with PostHog
 */
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  try {
    if (posthog && typeof posthog.capture === 'function') {
      posthog.capture(eventName, properties)
    }
  } catch (error) {
    console.error('Failed to track event:', error)
  }
}

/**
 * Identify a user in PostHog
 */
export function identifyUser(userId: string, properties?: Record<string, any>) {
  try {
    if (posthog && typeof posthog.identify === 'function') {
      posthog.identify(userId, properties)
    }
  } catch (error) {
    console.error('Failed to identify user:', error)
  }
}

/**
 * Track key launch events
 */
export const trackLaunchEvent = {
  demoLoaded: (projectId: string) => trackEvent('onboarding_loaded_demo', { project_id: projectId }),
  projectCreated: (projectId: string) => trackEvent('onboarding_project_created', { project_id: projectId }),
  subscriptionUpgraded: (planId: string) => trackEvent('subscription_upgraded', { plan_id: planId }),
  sequenceEnrolled: (sequenceId: string, leadId: string) => trackEvent('sequence_enrolled', { sequence_id: sequenceId, lead_id: leadId }),
  emailSent: (emailId: string, leadId: string) => trackEvent('email_sent', { email_id: emailId, lead_id: leadId }),
  aiRewriteUsed: (projectId: string, threadId: string) => trackEvent('ai_rewrite_used', { project_id: projectId, thread_id: threadId }),
}

