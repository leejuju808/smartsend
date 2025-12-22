"use client";

export function BillingNudge({ level }: { level: string }) {
  if (level === "none") return null;

  const styles =
    level === "critical"
      ? "bg-red-600 text-white"
      : level === "upgrade_soon"
      ? "bg-yellow-600 text-white"
      : "bg-yellow-300 text-black";

  const text =
    level === "critical"
      ? "Your usage will exceed your plan soon — upgrade immediately."
      : level === "upgrade_soon"
      ? "Your projected usage exceeds your plan. Consider upgrading."
      : "You're nearing your sending limits.";

  return (
    <div className={`${styles} p-3 rounded-md mt-4 text-sm font-medium`}>
      {text}
    </div>
  );
}








