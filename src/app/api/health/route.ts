import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || 'unknown'
  const dbConnected = await checkDbConnectivity()
  
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    service: 'SmartSend AI',
    version: '3.0.0',
    buildId,
    database: dbConnected ? 'connected' : 'disconnected',
    env: process.env.NODE_ENV || 'development',
  }, {
    status: dbConnected ? 200 : 503, // Service Unavailable if DB is down
  })
}

async function checkDbConnectivity(): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      return false
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    // Simple connectivity check - try to query a lightweight table
    const { error } = await supabase.from('profiles').select('id').limit(1)
    
    return !error
  } catch (error) {
    console.error('Health check DB connectivity error:', error)
    return false
  }
}
