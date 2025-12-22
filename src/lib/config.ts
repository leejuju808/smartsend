// Feature flags configuration
export const config = {
  // Marketplace Creator Portal
  MARKETPLACE_CREATOR_PORTAL_ENABLED: process.env.MARKETPLACE_CREATOR_PORTAL_ENABLED === 'true' || process.env.NODE_ENV === 'production',
  MARKETPLACE_REVIEWS_ENABLED: process.env.MARKETPLACE_REVIEWS_ENABLED === 'true' || process.env.NODE_ENV === 'production',
  MARKETPLACE_PAYOUTS_ENABLED: process.env.MARKETPLACE_PAYOUTS_ENABLED === 'true' || process.env.NODE_ENV === 'production',
  
  // App Configuration
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  
  // Stripe Configuration
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  
  // Supabase Configuration
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  
  // Payout Configuration
  DEFAULT_REV_SHARE_BPS: 500, // 5%
  MIN_PAYOUT_THRESHOLD_CENTS: 2000, // $20.00
  PAYOUT_SCHEDULE: process.env.PAYOUT_SCHEDULE || 'weekly', // weekly, monthly, manual
};

// Feature flag checks
export const isFeatureEnabled = (feature: keyof typeof config) => {
  return config[feature] === true;
};

// Environment validation
export const validateEnvironment = () => {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_APP_URL'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    return false;
  }
  
  console.log('✔️ Environment variables validated');
  return true;
}; 