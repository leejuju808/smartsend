// Block 20000 — Voice Photo Attachment API
// Handles voice commands to attach photos

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { thread_id, photo_type } = await req.json()

    if (!thread_id) {
      return NextResponse.json(
        { error: 'Thread ID is required' },
        { status: 400 }
      )
    }

    // Get thread attachments
    const { data: attachments, error: attachmentsError } = await supabase
      .from('inbox_attachments')
      .select('*')
      .eq('thread_id', thread_id)
      .order('created_at', { ascending: false })

    if (attachmentsError) {
      return NextResponse.json(
        { error: 'Failed to fetch attachments' },
        { status: 500 }
      )
    }

    const imageAttachments = (attachments || []).filter((att) =>
      att.file_type?.startsWith('image/')
    )

    let selectedAttachment = null

    // Match photo type
    switch (photo_type) {
      case 'last':
      case 'last_photo':
        selectedAttachment = imageAttachments[0] // Most recent
        break
      case 'leak':
      case 'leak_photo':
        // Find attachment with leak-related keywords in name or analysis
        selectedAttachment =
          imageAttachments.find(
            (att) =>
              att.file_name?.toLowerCase().includes('leak') ||
              att.metadata?.analysis?.includes('leak')
          ) || imageAttachments[0]
        break
      case 'roof':
      case 'roof_picture':
        // Find roof-related photo
        selectedAttachment =
          imageAttachments.find(
            (att) =>
              att.file_name?.toLowerCase().includes('roof') ||
              att.metadata?.analysis?.includes('roof')
          ) || imageAttachments[0]
        break
      default:
        selectedAttachment = imageAttachments[0]
    }

    if (!selectedAttachment) {
      return NextResponse.json(
        { error: 'No photos found in this thread' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      attachment_id: selectedAttachment.id,
      file_url: selectedAttachment.file_url,
      file_name: selectedAttachment.file_name,
      file_type: selectedAttachment.file_type,
    })
  } catch (error: any) {
    console.error('Photo attachment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to find photo' },
      { status: 500 }
    )
  }
}



















































