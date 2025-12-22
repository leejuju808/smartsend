"use client";

interface HeatmapProps<T> {
  data: T[];
  rows: number;
  cols: number;
  getValue: (item: T) => number;
  getTooltip?: (item: T) => string;
}

export function Heatmap<T>({ data, rows, cols, getValue, getTooltip }: HeatmapProps<T>) {
  const max = Math.max(...data.map(getValue), 1);

  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {data.map((d, i) => {
        const v = getValue(d);
        const intensity = max ? v / max : 0;
        const bg = `rgba(56, 189, 248, ${Math.max(0.1, intensity)})`; // cyan-400 heat, min opacity for visibility
        const tooltip = getTooltip ? getTooltip(d) : `Value: ${v}`;

        return (
          <div
            key={i}
            className="h-6 w-full rounded transition-all cursor-pointer hover:opacity-80"
            style={{ backgroundColor: bg }}
            title={tooltip}
          />
        );
      })}
    </div>
  );
}

