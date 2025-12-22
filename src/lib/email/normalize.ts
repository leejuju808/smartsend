export function normalizeEmail(input?: string | null): string {
  return (input ?? "").trim().toLowerCase();
}
