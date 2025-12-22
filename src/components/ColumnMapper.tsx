'use client';
import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type FieldMap = {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
};

const TARGETS: Array<{ key: keyof FieldMap; label: string; required?: boolean }> = [
  { key: 'email', label: 'Email', required: true },
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'company', label: 'Company' },
];

export function ColumnMapper({ headers, value, onChange }: { headers: string[]; value: FieldMap; onChange: (v: FieldMap) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {TARGETS.map((t) => (
        <div key={t.key} className="space-y-1">
          <div className="text-sm font-medium flex items-center gap-2">
            {t.label}
            {t.required && <span className="text-red-500 text-xs">(required)</span>}
          </div>
          <Select value={value[t.key] ?? ''} onValueChange={(v) => onChange({ ...value, [t.key]: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select a CSV column" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((h) => (
                <SelectItem key={h} value={h}>
                  {h}
                </SelectItem>
              ))}
              <SelectItem value="">(none)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}


