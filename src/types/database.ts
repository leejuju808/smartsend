export interface User {
  id: string
  email: string
  created_at: string
  updated_at: string
  subscription_status?: 'free' | 'pro' | 'cancelled'
  stripe_customer_id?: string
  email_credits?: number
}

export interface EmailTemplate {
  id: string
  user_id: string
  target_audience: string
  product_service: string
  tone: 'professional' | 'casual' | 'friendly' | 'formal'
  generated_emails: string
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  user_id: string
  stripe_subscription_id: string
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid'
  current_period_end: string
  created_at: string
  updated_at: string
} 