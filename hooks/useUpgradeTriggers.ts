/**
 * Block 23720 — Upgrade Triggers Hook
 * 
 * React hook to check and display upgrade triggers
 */

'use client';

import { useState, useEffect } from 'react';
import { UpgradeTriggerData } from '@/lib/upsell/trigger-detection';

interface UseUpgradeTriggersResult {
  triggers: UpgradeTriggerData[];
  primaryTrigger: UpgradeTriggerData | null;
  isLoading: boolean;
  error: string | null;
  checkTriggers: () => Promise<void>;
}

export function useUpgradeTriggers(): UseUpgradeTriggersResult {
  const [triggers, setTriggers] = useState<UpgradeTriggerData[]>([]);
  const [primaryTrigger, setPrimaryTrigger] = useState<UpgradeTriggerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkTriggers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/upsell/check-triggers');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check triggers');
      }

      setTriggers(data.triggers || []);
      setPrimaryTrigger(data.primaryTrigger || null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error checking upgrade triggers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkTriggers();
    
    // Check triggers every 5 minutes
    const interval = setInterval(checkTriggers, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    triggers,
    primaryTrigger,
    isLoading,
    error,
    checkTriggers,
  };
}






































