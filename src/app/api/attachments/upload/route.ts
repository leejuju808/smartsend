import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user (in production, use session/auth)
    const userId = req.headers.get('x-user-id') // TODO: Replace with actual auth
    const workspaceId = req.headers.get('x-workspace-id') // TODO: Replace with actual auth
    
    if (!userId || !workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const isInline = formData.get('isInline') === 'true'
    const contentId = formData.get('contentId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds 10 MB limit' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      )
    }

    // Generate unique filename
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 11)
    const extension = file.name.split('.').pop()
    const filename = `${timestamp}_${random}.${extension}`
    const storagePath = `${userId}/${filename}`

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer()
    const { data, error: uploadError } = await supabase.storage
      .from('email-attachments')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Generate content ID for inline images if not provided
    const finalContentId = contentId || (isInline ? `cid_${timestamp}_${random}` : null)

    // Insert attachment record
    const { data: attachment, error: insertError } = await supabase
      .from('email_attachments')
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        filename: file.name,
        content_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        is_inline: isInline,
        content_id: finalContentId,
      })
      .select('id, filename, content_id')
      .single()

    if (insertError) {
      console.error('Database insert error:', insertError)
      // Clean up uploaded file
      await supabase.storage.from('email-attachments').remove([storagePath])
      return NextResponse.json(
        { error: 'Failed to save attachment record' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      id: attachment.id,
      filename: attachment.filename,
      contentId: attachment.content_id,
      isInline,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


