// Block 21779 — SmartSend Roofing Lead Heat Score v1
// 🔥 The Homeowner Intent Engine
// Lead Heat Indicator Component (as specified in requirements)

interface LeadHeatIndicatorProps {
  score: number | null | undefined;
  category?: string | null;
  className?: string;
}

export function LeadHeatIndicator({ score, category, className = "" }: LeadHeatIndicatorProps) {
  const normalizedScore = score ?? 0;
  
  // Use category if provided, otherwise compute from score
  const computedCategory = category || 
    (normalizedScore >= 80 ? "hot" :
     normalizedScore >= 50 ? "warm" :
     normalizedScore >= 0 ? "cold" : "dead");

  const color =
    computedCategory === "hot" ? "text-red-400" :
    computedCategory === "warm" ? "text-yellow-300" :
    computedCategory === "cold" ? "text-blue-300" :
    "text-gray-500";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={`text-lg font-bold ${color}`}>{normalizedScore}</span>
      <span className={`capitalize ${color}`}>{computedCategory}</span>
    </div>
  );
}









































