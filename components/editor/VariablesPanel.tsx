'use client';

import { Button } from '@/components/ui/button';

interface VariablesPanelProps {
  variables?: string[];
  onInsert: (variable: string) => void;
}

const defaultVariables = [
  'first_name',
  'last_name',
  'company',
  'title',
  'email',
  'unsubscribe_link',
  'booking_link',
];

export function VariablesPanel({ 
  variables = defaultVariables, 
  onInsert 
}: VariablesPanelProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Variables</h3>
      <div className="space-y-1">
        {variables.map((variable) => (
          <Button
            key={variable}
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs font-mono"
            onClick={() => onInsert(variable)}
          >
            {`{{${variable}}}`}
          </Button>
        ))}
      </div>
    </div>
  );
}









