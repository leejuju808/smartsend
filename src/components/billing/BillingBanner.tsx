'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import Link from 'next/link';

interface BillingBannerProps {
  subscriptionStatus?: string;
  gracePeriodEndsAt?: string;
  onDismiss?: () => void;
}

export function BillingBanner({ subscriptionStatus, gracePeriodEndsAt, onDismiss }: BillingBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    if (!gracePeriodEndsAt) return;

    const updateTimeRemaining = () => {
      const now = new Date();
      const endsAt = new Date(gracePeriodEndsAt);
      const diff = endsAt.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('Grace period ended');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeRemaining(`${days} day${days !== 1 ? 's' : ''} remaining`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours} hour${hours !== 1 ? 's' : ''} remaining`);
      } else {
        setTimeRemaining(`${minutes} minute${minutes !== 1 ? 's' : ''} remaining`);
      }
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [gracePeriodEndsAt]);

  // BLOCK 269700: Missed payment = immediate silence.
  // Only show a single, neutral line. No buttons, no countdown, no dismissal.
  const shouldShow = subscriptionStatus && ['unpaid', 'past_due', 'payment_action_required'].includes(subscriptionStatus);

  if (!shouldShow) return null;

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-yellow-400" />
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm text-yellow-800">Outreach paused.</p>
        </div>
      </div>
    </div>
  );
}




























































