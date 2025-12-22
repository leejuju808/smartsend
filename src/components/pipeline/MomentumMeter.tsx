// Block 21998 — SmartSend Roofing Job Momentum Meter
// UI Component: Displays job momentum score (0-100) with trend indicator
// Appears on pipeline cards, lead detail, action queue, and owner dashboard
//
// High momentum → glowing green
// Low momentum → pulsing red outline
// Neutral → normal

"use client";

interface MomentumMeterProps {
  score: number | null;
  trend?: "positive" | "neutral" | "negative" | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  variant?: "meter" | "badge" | "card";
}

export function MomentumMeter({
  score,
  trend,
  size = "md",
  showLabel = true,
  variant = "meter",
}: MomentumMeterProps) {
  // Default to 50 if score is null
  const displayScore = score ?? 50;
  const displayTrend = trend ?? "neutral";

  // Color based on score
  const getColor = () => {
    if (displayScore >= 70) return "text-green-400";
    if (displayScore >= 40) return "text-yellow-300";
    return "text-red-500";
  };

  // Background color for badge/card variants
  const getBgColor = () => {
    if (displayScore >= 70) return "bg-green-500/20 border-green-500/30";
    if (displayScore >= 40) return "bg-yellow-500/20 border-yellow-500/30";
    return "bg-red-500/20 border-red-500/30";
  };

  // Glow effect for high momentum
  const getGlowClass = () => {
    if (displayScore >= 70 && displayTrend === "positive") {
      return "shadow-lg shadow-green-500/50";
    }
    if (displayScore < 30 && displayTrend === "negative") {
      return "animate-pulse ring-2 ring-red-500/50";
    }
    return "";
  };

  // Trend indicator
  const getTrendIcon = () => {
    if (displayTrend === "positive") return "↗";
    if (displayTrend === "negative") return "↘";
    return "→";
  };

  // Size classes
  const sizeClasses = {
    sm: {
      score: "text-sm",
      trend: "text-[0.65rem]",
      label: "text-[0.6rem]",
      container: "gap-0.5",
    },
    md: {
      score: "text-xl",
      trend: "text-xs",
      label: "text-xs",
      container: "gap-1",
    },
    lg: {
      score: "text-2xl",
      trend: "text-sm",
      label: "text-sm",
      container: "gap-1.5",
    },
  };

  const classes = sizeClasses[size];

  // Badge variant (compact, inline)
  if (variant === "badge") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getBgColor()} ${getGlowClass()}`}
      >
        <span>📈</span>
        <span className={getColor()}>{displayScore}</span>
        {displayTrend !== "neutral" && (
          <span className={`${classes.trend} opacity-70`}>
            {getTrendIcon()}
          </span>
        )}
      </span>
    );
  }

  // Card variant (larger display)
  if (variant === "card") {
    return (
      <div
        className={`flex flex-col items-center justify-center p-4 rounded-lg border ${getBgColor()} ${getGlowClass()}`}
      >
        <div className={`flex items-center gap-2 ${getColor()}`}>
          <span className={`font-bold ${classes.score}`}>{displayScore}</span>
          {displayTrend !== "neutral" && (
            <span className={`${classes.trend} opacity-70`}>
              {getTrendIcon()}
            </span>
          )}
        </div>
        {showLabel && (
          <>
            <span className={`${classes.trend} text-gray-400 capitalize mt-1`}>
              {displayTrend}
            </span>
            <span className={`${classes.label} text-gray-500 mt-0.5`}>
              Momentum
            </span>
          </>
        )}
      </div>
    );
  }

  // Default meter variant (compact vertical)
  return (
    <div className={`flex flex-col items-start ${classes.container}`}>
      <div className={`flex items-center gap-1 ${getColor()}`}>
        <span className={`font-bold ${classes.score}`}>{displayScore}</span>
        {displayTrend !== "neutral" && (
          <span className={`${classes.trend} opacity-70`}>
            {getTrendIcon()}
          </span>
        )}
      </div>
      {showLabel && (
        <>
          {displayTrend !== "neutral" && (
            <span className={`${classes.trend} text-gray-400 capitalize`}>
              {displayTrend}
            </span>
          )}
          <span className={`${classes.label} text-gray-500`}>Momentum</span>
        </>
      )}
    </div>
  );
}

// Compact badge version for inline display (matches spec)
export function MomentumBadge({
  score,
  trend,
}: {
  score: number | null;
  trend?: "positive" | "neutral" | "negative" | null;
}) {
  return <MomentumMeter score={score} trend={trend} variant="badge" showLabel={false} />;
}









































