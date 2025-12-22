import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json().catch(() => ({}))
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    // Call the Gmail poller function
    const response = await fetch(`${supabaseUrl}/functions/v1/gmail-poller`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ workspaceId }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: 'Gmail poller failed', details: errorText },
        { status: response.status }
      )
    }
    
    const result = await response.json()
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('Error calling Gmail poller:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}