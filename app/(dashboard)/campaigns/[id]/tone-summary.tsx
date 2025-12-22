export function ToneSummary({ data }: { data: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(data).map(([tone, count]) => (
        <div key={tone} className="p-3 rounded-xl border">
          <p className="font-semibold capitalize">{tone}</p>
          <p className="text-sm text-muted-foreground">{count} samples</p>
        </div>
      ))}
    </div>
  );
}
















