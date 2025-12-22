import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user (in production, use session/auth)
    const userId = req.headers.get('x-user-id') // TODO: Replace with actual auth
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch attachment metadata
    const { data: attachment, error: fetchError } = await supabase
      .from('email_attachments')
      .select('id, storage_path, workspace_id, user_id')
      .eq('id', params.id)
      .single()

    if (fetchError || !attachment) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      )
    }

    // Verify user has access to this attachment's workspace
    // TODO: Add workspace membership check

    // Generate signed URL valid for 1 hour
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from('email-attachments')
      .createSignedUrl(attachment.storage_path, 3600)

    if (urlError || !signedUrl) {
      return NextResponse.json(
        { error: 'Failed to generate download URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: signedUrl.signedUrl })
  } catch (error) {
    console.error('Download URL generation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


