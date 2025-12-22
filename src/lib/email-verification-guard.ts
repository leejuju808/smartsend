'use server'

import { createAdminClient } from '@/lib/supabase'

/**
 * Check if user's email is verified before allowing outbound sends
 * Returns true if verified, false otherwise
 */
export async function isEmailVerified(userId: string): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    
    // Check if user has email_confirmed_at set
    const { data: user } = await supabase.auth.admin.getUserById(userId)
    
    if (!user || !user.user) {
      return false
    }
    
    // Supabase Auth sets email_confirmed_at when email is verified
    return !!user.user.email_confirmed_at
  } catch (error) {
    console.error('Error checking email verification:', error)
    return false
  }
}

/**
 * Ensure user email is verified before allowing outbound sends
 * Throws an error if not verified
 */
export async function requireEmailVerified(userId: string): Promise<void> {
  const verified = await isEmailVerified(userId)
  
  if (!verified) {
    throw new Error('Email verification required. Please verify your email address before sending emails.')
  }
}

