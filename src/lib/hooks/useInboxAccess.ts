/**
 * Block 19750 — Inbox Access Hook
 * React hook to check if user has inbox access
 */

import { useEffect, useState } from 'react';
import { checkInboxAccess, InboxAccessResult } from '@/lib/inbox-access';

export function useInboxAccess() {
  const [access, setAccess] = useState<InboxAccessResult>({
    hasAccess: false,
    accessLevel: null,
    inboxEnabled: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAccess() {
      try {
        const result = await checkInboxAccess();
        setAccess(result);
      } catch (error) {
        console.error('Error fetching inbox access:', error);
        setAccess({
          hasAccess: false,
          accessLevel: null,
          inboxEnabled: false,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchAccess();
  }, []);

  return { ...access, loading };
}



















































