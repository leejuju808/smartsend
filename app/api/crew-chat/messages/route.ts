// Block 253600 — SmartSend Crew Communication Suite v1
// API: Send and retrieve chat messages

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// POST /api/crew-chat/messages - Send a message
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { room_id, message, photo_url, audio_url, message_type = 'text' } = body

    if (!room_id || !message) {
      return NextResponse.json(
        { error: 'room_id and message are required' },
        { status: 400 }
      )
    }

    // Verify user has access to this room
    const { data: membership } = await supabase
      .from('chat_room_members')
      .select('*')
      .eq('room_id', room_id)
      .or(`employee_id.in.(SELECT id FROM workforce_employees WHERE email = '${user.email}'),user_id.eq.${user.id}`)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get employee_id if user is an employee
    const { data: employee } = await supabase
      .from('workforce_employees')
      .select('id')
      .eq('email', user.email)
      .single()

    // Insert message
    const messageData: any = {
      room_id,
      message,
      message_type,
      user_id: user.id,
    }

    if (employee?.id) {
      messageData.employee_id = employee.id
    }

    if (photo_url) {
      messageData.photo_url = photo_url
      messageData.message_type = 'photo'
    }

    if (audio_url) {
      messageData.audio_url = audio_url
      messageData.message_type = 'audio'
    }

    const { data: newMessage, error: insertError } = await supabase
      .from('chat_messages')
      .insert(messageData)
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting message:', insertError)
      return NextResponse.json(
        { error: 'Failed to send message', details: insertError.message },
        { status: 500 }
      )
    }

    // Process AI features asynchronously
    if (photo_url) {
      // Process photo-to-note in background
      processPhotoToNote(newMessage.id, photo_url, message).catch(console.error)
    }

    if (audio_url) {
      // Process voice-to-note in background
      processVoiceToNote(newMessage.id, audio_url).catch(console.error)
    }

    // Process translation in background
    processTranslation(newMessage.id, message).catch(console.error)

    return NextResponse.json({ message: newMessage }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/crew-chat/messages:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// GET /api/crew-chat/messages - Get messages for a room
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const room_id = searchParams.get('room_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!room_id) {
      return NextResponse.json(
        { error: 'room_id is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this room
    const { data: membership } = await supabase
      .from('chat_room_members')
      .select('*')
      .eq('room_id', room_id)
      .or(`employee_id.in.(SELECT id FROM workforce_employees WHERE email = '${user.email}'),user_id.eq.${user.id}`)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get messages
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select(`
        *,
        workforce_employees:employee_id (
          id,
          first_name,
          last_name,
          role
        )
      `)
      .eq('room_id', room_id)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching messages:', error)
      return NextResponse.json(
        { error: 'Failed to fetch messages', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ messages: messages || [] }, { status: 200 })
  } catch (error: any) {
    console.error('Error in GET /api/crew-chat/messages:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// AI Processing Functions

async function processPhotoToNote(
  messageId: string,
  photoUrl: string,
  originalMessage: string
) {
  try {
    const supabase = await createClient()

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are SmartSend Photo-to-Note AI. Analyze roofing jobsite photos and convert them into structured, professional notes.

When a crew member uploads a photo, turn it into a clear, structured note that a PM can understand instantly.

Format your response as a bulleted list of observations. Focus on:
- Installation progress (what's done, what's next)
- Material status (what's visible, what's missing)
- Quality observations (any issues or concerns)
- Readiness status (ready for next step, needs attention, etc.)

Be concise, professional, and specific. Use roofing terminology correctly.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this jobsite photo and create a structured note. Original message: "${originalMessage}"

Return ONLY the structured note text, formatted as a bulleted list.`,
            },
            {
              type: 'image_url',
              image_url: { url: photoUrl, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    })

    const aiNote = response.choices[0]?.message?.content

    if (aiNote) {
      await supabase
        .from('chat_messages')
        .update({ ai_photo_note: aiNote })
        .eq('id', messageId)
    }
  } catch (error) {
    console.error('Error processing photo-to-note:', error)
  }
}

async function processVoiceToNote(messageId: string, audioUrl: string) {
  try {
    const supabase = await createClient()

    // Download audio file
    const audioResponse = await fetch(audioUrl)
    const audioBlob = await audioResponse.blob()
    const audioFile = new File([audioBlob], 'audio.mp3', {
      type: 'audio/mpeg',
    })

    // Transcribe with OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
    })

    const rawTranscript = transcription.text

    // Clean and structure the transcription
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are SmartSend Voice-to-Note AI. Clean and structure voice message transcriptions from roofing crews.

Crew members often speak casually with "uh", "like", "maybe", etc. Clean this up into professional, structured notes.

Example:
Original: "hey boss uh we tore off and found like some rotten wood I think maybe 4 sheets maybe can you check"
Cleaned: "Rotten decking found during tear-off. Estimated: 4 sheets. Crew requests confirmation for change order."

Be concise, professional, and preserve all important information.`,
        },
        {
          role: 'user',
          content: `Clean and structure this voice transcription:\n\n"${rawTranscript}"`,
        },
      ],
      max_tokens: 300,
      temperature: 0.2,
    })

    const cleanedTranscript = response.choices[0]?.message?.content

    if (cleanedTranscript) {
      await supabase
        .from('chat_messages')
        .update({
          ai_transcription: cleanedTranscript,
          message: rawTranscript, // Store original transcript as message
        })
        .eq('id', messageId)
    }
  } catch (error) {
    console.error('Error processing voice-to-note:', error)
  }
}

async function processTranslation(messageId: string, message: string) {
  try {
    const supabase = await createClient()

    // Detect language
    const detectResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Detect the language of this message. Respond with only "en" for English or "es" for Spanish.',
        },
        {
          role: 'user',
          content: message,
        },
      ],
      max_tokens: 10,
      temperature: 0,
    })

    const detectedLang = detectResponse.choices[0]?.message?.content?.trim()

    // Only translate if not English
    if (detectedLang === 'es') {
      const translateResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Translate this Spanish message to English. Preserve the meaning and tone.',
          },
          {
            role: 'user',
            content: message,
          },
        ],
        max_tokens: 500,
        temperature: 0.2,
      })

      const translated = translateResponse.choices[0]?.message?.content

      if (translated) {
        await supabase
          .from('chat_messages')
          .update({
            translated_message: translated,
            detected_language: 'es',
          })
          .eq('id', messageId)
      }
    } else if (detectedLang === 'en') {
      // Translate English to Spanish for Spanish speakers
      const translateResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Translate this English message to Spanish. Preserve the meaning and tone.',
          },
          {
            role: 'user',
            content: message,
          },
        ],
        max_tokens: 500,
        temperature: 0.2,
      })

      const translated = translateResponse.choices[0]?.message?.content

      if (translated) {
        await supabase
          .from('chat_messages')
          .update({
            translated_message: translated,
            detected_language: 'en',
          })
          .eq('id', messageId)
      }
    }
  } catch (error) {
    console.error('Error processing translation:', error)
  }
}
























