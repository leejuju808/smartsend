// Block 21728 — SmartSend Roofing Lead Status Brain v1
// UI Component — Status Indicator (Lead Header)
// Displays lead status with color-coded badges

type LeadStatus = "hot" | "warm" | "cold" | "new";

interface LeadStatusProps {
  status: LeadStatus | string;
  className?: string;
}

export function LeadStatus({ status, className = "" }: LeadStatusProps) {
  const normalizedStatus = (status || "new").toLowerCase() as LeadStatus;

  const getStatusConfig = (status: LeadStatus) => {
    switch (status) {
      case "hot":
        return {
          bgColor: "bg-red-600",
          textColor: "text-white",
          label: "HOT",
        };
      case "warm":
        return {
          bgColor: "bg-yellow-500",
          textColor: "text-white",
          label: "WARM",
        };
      case "cold":
        return {
          bgColor: "bg-gray-600",
          textColor: "text-white",
          label: "COLD",
        };
      case "new":
      default:
        return {
          bgColor: "bg-blue-600",
          textColor: "text-white",
          label: "NEW",
        };
    }
  };

  const config = getStatusConfig(normalizedStatus);

  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-semibold ${config.bgColor} ${config.textColor} ${className}`}
    >
      {config.label}
    </span>
  );
}










































