"use client";

import { Button } from "@/components/ui/Button";

export function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
  secondary,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="border rounded-2xl p-8 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      {(actionLabel && onAction) && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button onClick={onAction}>{actionLabel}</Button>
          {secondary}
        </div>
      )}
    </div>
  );
}

