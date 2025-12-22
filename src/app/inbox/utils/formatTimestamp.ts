export function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Today
  if (diffDays === 0) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // This week
  if (diffDays < 7) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  // Older
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}



















































