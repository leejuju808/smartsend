/**
 * Block 23610 — Dashboard Visit Tracker Hook
 * Tracks dashboard visits for churn prevention
 */

import { useEffect } from 'react';

export function useDashboardTracker() {
  useEffect(() => {
    // Track dashboard visit on mount
    fetch('/api/churn-prevention/track-dashboard-visit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch(err => {
      console.error('Failed to track dashboard visit:', err);
    });
  }, []);
}






































