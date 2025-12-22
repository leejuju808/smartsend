/**
 * Server-only env reader (do not import in client components).
 * Masks secrets when you need to display presence in UI.
 */
export const serverEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,

  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_STRIPE_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
  STRIPE_ANNUAL_PRICE_ID: process.env.STRIPE_ANNUAL_PRICE_ID,

  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
};

export function mask(val?: string | null) {
  if (!val) return '—';
  if (val.length <= 6) return '*'.repeat(val.length);
  return `${val.slice(0, 3)}***${val.slice(-3)}`;
}

export function present(val?: string | null) {
  return Boolean(val && val.trim().length > 0);
} 