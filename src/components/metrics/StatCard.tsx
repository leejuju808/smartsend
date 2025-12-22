import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  subtitle,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-card p-6 shadow-sm", className)}>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
    </div>
  );
}
