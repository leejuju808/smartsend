// Simple radial gauge (0–100) without external libs.
// Value >100 caps visually at 100.
export function MBGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = 80;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  const dash = (v / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="h-48 w-48">
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.1}
          strokeWidth={stroke}
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
        />
        <text
          x="100"
          y="105"
          textAnchor="middle"
          className="fill-current text-3xl font-semibold"
        >
          {Number.isFinite(value) ? value : 0}
        </text>
        <text
          x="100"
          y="135"
          textAnchor="middle"
          className="fill-current text-xs opacity-60"
        >
          MB per 100 Replies
        </text>
      </svg>
      <div className="mt-2 text-xs text-muted-foreground">
        0 = no bookings, 100 = a meeting for every reply
      </div>
    </div>
  );
}
