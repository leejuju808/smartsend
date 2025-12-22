/**
 * Block 23720 — Upgrade Trigger Manager Component
 * 
 * Manages showing upgrade modals when triggers are detected
 */

'use client';

import { useEffect, useState } from 'react';
import { useUpgradeTriggers } from '@/hooks/useUpgradeTriggers';
import { ContextualUpgradeModal } from './ContextualUpgradeModal';
import { UpgradeTriggerData } from '@/lib/upsell/trigger-detection';

export function UpgradeTriggerManager() {
  const { primaryTrigger, isLoading } = useUpgradeTriggers();
  const [showModal, setShowModal] = useState(false);
  const [currentTrigger, setCurrentTrigger] = useState<UpgradeTriggerData | null>(null);

  useEffect(() => {
    if (primaryTrigger && !isLoading) {
      // Check if we've shown this trigger recently (client-side check)
      const lastShown = localStorage.getItem(`upgrade_trigger_${primaryTrigger.triggerType}`);
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000; // 24 hours

      if (!lastShown || now - parseInt(lastShown) > cooldown) {
        setCurrentTrigger(primaryTrigger);
        setShowModal(true);
        localStorage.setItem(`upgrade_trigger_${primaryTrigger.triggerType}`, now.toString());
      }
    }
  }, [primaryTrigger, isLoading]);

  const handleClose = () => {
    setShowModal(false);
    setCurrentTrigger(null);
  };

  if (!currentTrigger) {
    return null;
  }

  return (
    <ContextualUpgradeModal
      isOpen={showModal}
      onClose={handleClose}
      triggerType={currentTrigger.triggerType}
      currentPlan={currentTrigger.currentPlan}
      suggestedPlan={currentTrigger.suggestedPlan}
      message={currentTrigger.message}
      script={currentTrigger.script}
      context={currentTrigger.context}
    />
  );
}






































