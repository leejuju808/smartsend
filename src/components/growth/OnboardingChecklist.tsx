'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface OnboardingItem {
  key: string;
  title: string;
  completed: boolean;
}

interface OnboardingChecklistProps {
  items: OnboardingItem[];
}

export function OnboardingChecklist({ items }: OnboardingChecklistProps) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Getting Started</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3">
              <span
                className={`h-4 w-4 rounded-full ${
                  item.completed ? 'bg-green-500' : 'bg-muted'
                }`}
              />
              <span
                className={
                  item.completed ? 'line-through text-muted-foreground' : ''
                }
              >
                {item.title}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

