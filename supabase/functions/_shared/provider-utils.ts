export type Conn = {
  id: string;
  provider: "gmail" | "outlook";
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  email?: string | null;
  meta?: any;
};

export function isExpiredSoon(expires_at?: string | null, skewSeconds = 90) {
  if (!expires_at) return true;
  const t = new Date(expires_at).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() + skewSeconds * 1000 >= t;
}











