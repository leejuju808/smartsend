type SendMeterProps = {
  sent: number;
  total: number;
  remaining: number;
  windowEnd: string | null;
};

export function SendMeter({ sent, total, remaining, windowEnd }: SendMeterProps) {
  const pct = Math.min(100, Math.round((sent / Math.max(total, 1)) * 100));

  return (
    <div className="p-3 border rounded-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-muted-foreground">Monthly sends</div>
        <div className="text-sm">
          {sent}/{total} • {remaining} left
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        Resets{" "}
        {windowEnd
          ? new Date(windowEnd).toLocaleDateString()
          : "soon"}
      </div>
    </div>
  );
}





