// Block 20000 — Voice Transcription API
// Transcribes audio using OpenAI Whisper API

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      )
    }

    // Convert File to format expected by OpenAI
    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Create a File-like object for OpenAI
    const file = new File([buffer], audioFile.name, { type: audioFile.type })

    // Transcribe with OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en', // Optimize for English
      response_format: 'text',
      temperature: 0,
      // Optimize for outdoor conditions
      prompt: 'This is a roofing professional speaking. They may be on a roof, in wind, or in noisy conditions. Transcribe clearly, removing filler words like "um", "uh", "like".',
    })

    const transcript = typeof transcription === 'string' 
      ? transcription 
      : transcription.text || ''

    // Clean up transcript (remove filler words, stutters)
    const cleaned = cleanTranscript(transcript)

    return NextResponse.json({
      transcript: cleaned,
      raw_transcript: transcript,
    })
  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: error.message || 'Transcription failed' },
      { status: 500 }
    )
  }
}

function cleanTranscript(text: string): string {
  // Remove common filler words and stutters
  const fillerWords = [
    /\b(um|uh|er|ah|like|you know|I mean)\b/gi,
    /\b(uh-huh|hmm|huh)\b/gi,
    /\b(so|well|actually|basically|literally)\b(?=\s+\w+\s+\w+)/gi, // Only if followed by more words
  ]

  let cleaned = text.trim()

  // Remove filler words
  fillerWords.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, '')
  })

  // Remove repeated words (stutters)
  cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1')

  // Remove extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }

  return cleaned
}

