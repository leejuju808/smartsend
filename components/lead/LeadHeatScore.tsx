// Block 21779 — SmartSend Roofing Lead Heat Score v1
// 🔥 The Homeowner Intent Engine
// Heat Score Chip Component

interface LeadHeatScoreProps {
  score: number | null | undefined;
  category?: string | null;
  className?: string;
}

export function LeadHeatScore({ score, category, className = "" }: LeadHeatScoreProps) {
  const normalizedScore = score ?? 0;
  
  // Use category if provided, otherwise compute from score
  const computedCategory = category || 
    (normalizedScore >= 80 ? "hot" :
     normalizedScore >= 50 ? "warm" :
     normalizedScore >= 0 ? "cold" : "dead");

  let label = "❄️ COLD";
  let bg = "bg-blue-500";
  let textColor = "text-blue-300";

  if (computedCategory === "hot") {
    label = "🔥 HOT";
    bg = "bg-red-600";
    textColor = "text-red-400";
  } else if (computedCategory === "warm") {
    label = "⚠️ WARM";
    bg = "bg-yellow-500";
    textColor = "text-yellow-300";
  } else if (computedCategory === "cold") {
    label = "❄️ COLD";
    bg = "bg-blue-500";
    textColor = "text-blue-300";
  } else if (computedCategory === "dead") {
    label = "DEAD";
    bg = "bg-gray-700";
    textColor = "text-gray-500";
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${bg} ${className}`}>
      <span className={`text-xs font-bold ${textColor}`}>{label}</span>
      <span className={`text-xs ${textColor}/80`}>{normalizedScore}</span>
    </div>
  );
}


