'use client';

import { InboxRow } from '@/lib/replies/types';
import { cn } from '@/lib/utils';
import { CheckCircle, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AiLabelBadge } from './AiLabelBadge';

export default function ThreadRow({ 
  row, 
  selected, 
  onClick,
  hasTask
}: { 
  row: InboxRow; 
  selected?: boolean; 
  onClick?: () => void;
  hasTask?: boolean;
}) {
  const ai = row.ai_flag;
  const providerIcon = row.provider === 'gmail' ? '📧' : '📬';
  
  return (
    <div 
      onClick={onClick} 
      className={cn(
        'px-4 py-3 cursor-pointer border-b hover:bg-muted/60 transition-colors',
        selected && 'bg-muted'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-lg flex-shrink-0">{providerIcon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">
                {row.lead_name || row.lead_email}
              </span>
              <span className="opacity-60 truncate text-sm">
                — {row.subject || '(no subject)'}
              </span>
              <AiLabelBadge label={row.reply_event_label} />
            </div>
            {row.last_snippet && (
              <div className="text-sm opacity-80 truncate mt-1">
                {row.last_snippet}
              </div>
            )}
            {(row.last_inbound_label || typeof row.last_inbound_confidence === 'number' || row.last_inbound_reason) && (
              <div className="text-xs opacity-60 mt-1">
                {(() => {
                  const segments: string[] = [];
                  if (row.last_inbound_label) {
                    let labelText = `AI: ${row.last_inbound_label}`;
                    if (typeof row.last_inbound_confidence === 'number') {
                      labelText += ` (${Math.round(row.last_inbound_confidence * 100)}%)`;
                    }
                    segments.push(labelText);
                  } else if (typeof row.last_inbound_confidence === 'number') {
                    segments.push(`AI confidence ${Math.round(row.last_inbound_confidence * 100)}%`);
                  }
                  if (row.last_inbound_reason) {
                    segments.push(row.last_inbound_reason);
                  }
                  return segments.join(' • ');
                })()}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasTask && (
            <Badge variant="outline" className="border-yellow-300 text-yellow-800 bg-yellow-50">
              Task
            </Badge>
          )}
          {ai === 'handwritten' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              AI: likely-handwritten
            </span>
          )}
          {ai === 'ooo' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-700 border border-yellow-500/20">
              AI: OOO
            </span>
          )}
          {ai === 'spammy' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 border border-red-500/20">
              AI: spammy
            </span>
          )}
          <span className="text-xs opacity-60 whitespace-nowrap">
            {new Date(row.last_activity_at).toLocaleString()}
          </span>
          {row.status === 'replied' ? (
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          ) : (
            <Circle className="h-4 w-4 opacity-50 flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}

