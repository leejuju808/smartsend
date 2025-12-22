export function CounterBadge({ n }: { n: number | undefined }) {
  if (typeof n !== "number") return null;
  return (
    <span className="ml-1 inline-flex min-w-[18px] items-center justify-center rounded-full border px-1 text-[10px] leading-4 text-muted-foreground">
      {n}
    </span>
  );
}


