// Block 22237 — SmartSend Roofing Homeowner Experience Meter v2
// UI Component: Displays homeowner experience score (0-100) with trend indicator
// Appears on lead cards, pipeline board, and lead detail views
// Now supports numeric trend (-20 to +20) and colored dot indicators

"use client";

interface HomeownerExperienceMeterProps {
  score: number | null;
  trend?: "improving" | "declining" | "stable" | null;
  trendNumeric?: number | null; // -20 to +20
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  variant?: "badge" | "card" | "panel"; // card = pipeline card, panel = detail panel
}

export function HomeownerExperienceMeter({
  score,
  trend,
  trendNumeric,
  size = "md",
  showLabel = true,
  variant = "badge",
}: HomeownerExperienceMeterProps) {
  // Default to 50 if score is null
  const displayScore = score ?? 50;
  const displayTrend = trend ?? "stable";
  
  // Use numeric trend if available, otherwise infer from text trend
  const numericTrend = trendNumeric ?? (trend === "improving" ? 5 : trend === "declining" ? -5 : 0);

  // Color based on score ranges (v2 ranges)
  const getColor = () => {
    if (displayScore >= 85) return "text-green-400"; // Excellent
    if (displayScore >= 60) return "text-yellow-300"; // Good
    if (displayScore >= 40) return "text-orange-400"; // Neutral/Slipping
    if (displayScore >= 20) return "text-red-400"; // Negative
    return "text-red-600"; // Critical
  };

  // Background color for badge
  const getBgColor = () => {
    if (displayScore >= 85) return "bg-green-500/20 border-green-500/30";
    if (displayScore >= 60) return "bg-yellow-500/20 border-yellow-500/30";
    if (displayScore >= 40) return "bg-orange-500/20 border-orange-500/30";
    if (displayScore >= 20) return "bg-red-500/20 border-red-500/30";
    return "bg-red-600/20 border-red-600/30";
  };

  // Colored dot indicator (v2 feature)
  const getDotColor = () => {
    if (displayScore >= 85) return "🟢"; // Excellent
    if (displayScore >= 60) return "🟡"; // Good
    if (displayScore >= 40) return "🟠"; // Neutral/Slipping
    if (displayScore >= 20) return "🔴"; // Negative
    return "⚫"; // Critical
  };

  // Trend indicator with arrow
  const getTrendIcon = () => {
    if (numericTrend > 0) return "↑"; // Improving
    if (numericTrend < 0) return "↓"; // Declining
    return "→"; // Stable
  };
  
  const getTrendColor = () => {
    if (numericTrend > 0) return "text-green-300";
    if (numericTrend < 0) return "text-red-300";
    return "text-gray-300";
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

  // Card variant for pipeline cards (compact with dot)
  if (variant === "card") {
    return (
      <div className="inline-flex items-center gap-1.5">
        <span className="text-sm">{getDotColor()}</span>
        <span className={`font-semibold text-sm ${getColor()}`}>
          {displayScore}
        </span>
        {numericTrend !== 0 && (
          <span className={`text-xs ${getTrendColor()}`}>
            {getTrendIcon()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${classes.container}`}>
      <div className={`flex items-center gap-1 ${getColor()}`}>
        {variant === "panel" && (
          <span className="text-lg mr-1">{getDotColor()}</span>
        )}
        <span className={`font-bold ${classes.score}`}>{displayScore}</span>
        {(trend || numericTrend !== 0) && (
          <span className={`${classes.trend} ${getTrendColor()}`}>
            {getTrendIcon()}
          </span>
        )}
      </div>
      {showLabel && (
        <>
          {(trend || numericTrend !== 0) && (
            <span className={`${classes.trend} text-gray-400 capitalize`}>
              {displayTrend}
            </span>
          )}
          <span className={`${classes.label} text-gray-500`}>
            Homeowner Experience
          </span>
        </>
      )}
    </div>
  );
}

// Compact badge version for inline display (v2 enhanced)
export function HomeownerExperienceBadge({
  score,
  trend,
  trendNumeric,
}: {
  score: number | null;
  trend?: "improving" | "declining" | "stable" | null;
  trendNumeric?: number | null;
}) {
  const displayScore = score ?? 50;
  const displayTrend = trend ?? "stable";
  const numericTrend = trendNumeric ?? (trend === "improving" ? 5 : trend === "declining" ? -5 : 0);

  // v2 color ranges
  const getColor = () => {
    if (displayScore >= 85) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (displayScore >= 60) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    if (displayScore >= 40) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    if (displayScore >= 20) return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-red-600/20 text-red-600 border-red-600/30";
  };

  // Colored dot indicator
  const getDotColor = () => {
    if (displayScore >= 85) return "🟢";
    if (displayScore >= 60) return "🟡";
    if (displayScore >= 40) return "🟠";
    if (displayScore >= 20) return "🔴";
    return "⚫";
  };

  const getTrendIcon = () => {
    if (numericTrend > 0) return "↑";
    if (numericTrend < 0) return "↓";
    return "";
  };
  
  const getTrendColor = () => {
    if (numericTrend > 0) return "text-green-300";
    if (numericTrend < 0) return "text-red-300";
    return "";
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getColor()}`}
    >
      <span>{getDotColor()}</span>
      <span>{displayScore}</span>
      {getTrendIcon() && (
        <span className={`text-[0.65rem] ${getTrendColor()}`}>{getTrendIcon()}</span>
      )}
    </span>
  );
}

