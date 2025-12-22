'use client';

import { Button } from '@/components/ui/Button';
import { Download } from 'lucide-react';

export function UsageExport() {
  const go = (format: 'csv' | 'json') => {
    const qs = new URLSearchParams({ kind: 'billing', format });
    window.open(`/api/exports?${qs.toString()}`, '_blank');
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => go('csv')} className="flex items-center gap-2">
        <Download className="w-4 h-4" />
        Export Usage (CSV)
      </Button>
      <Button variant="outline" onClick={() => go('json')} className="flex items-center gap-2">
        <Download className="w-4 h-4" />
        Export Usage (JSON)
      </Button>
    </div>
  );
}

