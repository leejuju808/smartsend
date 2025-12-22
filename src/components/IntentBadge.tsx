import { getIntentColor, getIntentLabel } from "@/lib/intent-utils";

interface IntentBadgeProps {
  intent: string | null | undefined;
  confidence?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function IntentBadge({ intent, confidence, size = "sm", className = "" }: IntentBadgeProps) {
  if (!intent) return null;

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5"
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${getIntentColor(intent)} ${sizeClasses[size]} ${className}`}
      title={confidence !== null && confidence !== undefined ? `Confidence: ${Math.round(confidence * 100)}%` : undefined}
    >
      {getIntentLabel(intent)}
      {confidence !== null && confidence !== undefined && (
        <span className="ml-1 opacity-70">({Math.round(confidence * 100)}%)</span>
      )}
    </span>
  );
}

