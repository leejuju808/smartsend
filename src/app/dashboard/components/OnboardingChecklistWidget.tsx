'use client';

import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/utils/supabase/client';
import { OnboardingChecklist } from '@/components/growth/OnboardingChecklist';
import { isCoachingUIEnabled } from '@/lib/feature-flags';

interface OnboardingItem {
  key: string;
  title: string;
  completed: boolean;
}

export default function OnboardingChecklistWidget() {
  // BLOCK 272500 — Internalization Sprint: no coaching UI by default.
  if (!isCoachingUIEnabled()) return null;

  const supabase = getBrowserSupabase();
  const [items, setItems] = useState<OnboardingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadChecklist() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Load onboarding items
      const { data: onboardingItems } = await supabase
        .from('onboarding_items')
        .select('key, title, order_index')
        .order('order_index');

      // Load user progress
      const { data: progress } = await supabase
        .from('onboarding_progress')
        .select('item_key, completed')
        .eq('user_id', user.id);

      // Merge items with progress
      const merged =
        (onboardingItems || []).map((item: any) => ({
          key: item.key,
          title: item.title,
          completed:
            progress?.find((p: any) => p.item_key === item.key)?.completed ||
            false,
        }));

      setItems(merged);
      setLoading(false);
    }

    loadChecklist();
  }, [supabase]);

  if (loading) {
    return null;
  }

  if (items.length === 0) {
    return null;
  }

  // Only show if not all completed
  const allCompleted = items.every((item) => item.completed);
  if (allCompleted) {
    return null;
  }

  return (
    <div className="mb-6">
      <OnboardingChecklist items={items} />
    </div>
  );
}

