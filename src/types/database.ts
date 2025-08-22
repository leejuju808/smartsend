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
  optimized_version?: string
  performance_notes?: string
  created_at: string
  updated_at: string
  user?: {
    email: string
  }
}

export interface TemplateSuggestion {
  id: string
  template_id: string
  suggestion: string
  suggestion_type: 'subject' | 'body' | 'tone' | 'personalization'
  ai_score?: number
  created_at: string
  accepted: boolean
}

export interface AISuggestion {
  type: 'subject' | 'body' | 'tone' | 'personalization'
  content: string
  score: number
  reasoning: string
}

export interface AIOptimizationResult {
  suggestions: AISuggestion[]
  overall_score: number
  performance_notes: string
}

export interface TemplateComment {
  id: string
  template_id: string
  user_id: string
  comment: string
  created_at: string
  user?: {
    email: string
  }
}

export interface TeamActivity {
  id: string
  workspace_id: string
  user_id: string
  action: string
  entity_type: string
  entity_id?: string
  details?: any
  created_at: string
  user?: {
    email: string
  }
}

export interface Workspace {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
  user?: {
    email: string
  }
}

export interface Campaign {
  id: string
  workspace_id?: string
  user_id: string
  name: string
  approval_status?: 'draft' | 'pending_approval' | 'approved' | 'rejected'
  approved_by?: string
  approved_at?: string
  created_at: string
  updated_at: string
  user?: {
    email: string
  }
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