/**
 * Block 9400 — AI Personalization Engine v1
 * UI Indicator for AI Personalization Status
 */

'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { InfoIcon } from 'lucide-react';

interface PersonalizationStatusProps {
  workspaceId: string;
  className?: string;
}

export function PersonalizationStatus({
  workspaceId,
  className = '',
}: PersonalizationStatusProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const response = await fetch(`/api/ai/personalization/status?workspace_id=${workspaceId}`);
        if (response.ok) {
          const data = await response.json();
          setEnabled(data.enabled || false);
        } else {
          setEnabled(false);
        }
      } catch (error) {
        console.error('Failed to check personalization status:', error);
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    }

    if (workspaceId) {
      checkStatus();
    }
  }, [workspaceId]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Badge variant="outline" className="text-xs">
          Checking...
        </Badge>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Badge variant="outline" className="text-xs text-muted-foreground">
          AI Personalization: OFF
        </Badge>
        <div className="group relative">
          <InfoIcon className="h-3 w-3 text-muted-foreground cursor-help" />
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-popover border rounded-md shadow-lg text-xs z-50">
            AI Personalization is available on Growth and Domination plans. Upgrade to enable
            automatic email personalization.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge variant="default" className="text-xs bg-green-600">
        AI Personalization: ON
      </Badge>
      <div className="group relative">
        <InfoIcon className="h-3 w-3 text-muted-foreground cursor-help" />
        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-popover border rounded-md shadow-lg text-xs z-50">
          Your emails are automatically personalized with local context, weather events, and
          human-like rewrites. Available on Growth/Domination plans.
        </div>
      </div>
    </div>
  );
}

