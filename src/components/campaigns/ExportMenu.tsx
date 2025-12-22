'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Download } from 'lucide-react';

export function ExportMenu({ campaignId }: { campaignId: string }) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const dl = (kind: 'activity' | 'send_logs' | 'inbox') => {
    const qs = new URLSearchParams({ kind, campaignId, format });
    window.open(`/api/exports?${qs.toString()}`, '_blank');
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        Export
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          <div className="p-2 border-b">
            <div className="text-xs font-medium text-gray-700 mb-2">Format</div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={format === 'csv' ? 'default' : 'secondary'}
                onClick={() => setFormat('csv')}
                className="flex-1"
              >
                CSV
              </Button>
              <Button
                size="sm"
                variant={format === 'json' ? 'default' : 'secondary'}
                onClick={() => setFormat('json')}
                className="flex-1"
              >
                JSON
              </Button>
            </div>
          </div>
          <div className="p-1">
            <button
              onClick={() => dl('activity')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
            >
              Activity
            </button>
            <button
              onClick={() => dl('send_logs')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
            >
              Send Logs
            </button>
            <button
              onClick={() => dl('inbox')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
            >
              Inbox (Replies)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

