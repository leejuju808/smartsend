// Block 20000 — Voice Recording Hook
// Handles voice recording, transcription, and cleanup

'use client'

import { useState, useRef, useCallback } from 'react'

export interface VoiceRecordingState {
  isRecording: boolean
  isTranscribing: boolean
  transcript: string | null
  error: string | null
  audioBlob: Blob | null
  duration: number
}

export function useVoiceRecording() {
  const [state, setState] = useState<VoiceRecordingState>({
    isRecording: false,
    isTranscribing: false,
    transcript: null,
    error: null,
    audioBlob: null,
    duration: 0,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  const startRecording = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Optimized for Whisper API
        },
      })

      streamRef.current = stream

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm;codecs=opus',
        })

        setState((prev) => ({
          ...prev,
          audioBlob,
          isRecording: false,
        }))

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        // Clear duration interval
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current)
          durationIntervalRef.current = null
        }
      }

      mediaRecorder.start()
      startTimeRef.current = Date.now()

      // Update duration every second
      durationIntervalRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }))
      }, 1000)

      setState({
        isRecording: true,
        isTranscribing: false,
        transcript: null,
        error: null,
        audioBlob: null,
        duration: 0,
      })
    } catch (error: any) {
      console.error('Error starting recording:', error)
      setState((prev) => ({
        ...prev,
        error: error.message || 'Failed to start recording',
        isRecording: false,
      }))
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop()
    }
  }, [state.isRecording])

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setState((prev) => ({ ...prev, isTranscribing: true, error: null }))

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Transcription failed')
      }

      const data = await response.json()

      setState((prev) => ({
        ...prev,
        transcript: data.transcript || '',
        isTranscribing: false,
      }))

      return data.transcript || ''
    } catch (error: any) {
      console.error('Error transcribing audio:', error)
      setState((prev) => ({
        ...prev,
        error: error.message || 'Transcription failed',
        isTranscribing: false,
      }))
      throw error
    }
  }, [])

  const improveTranscript = useCallback(async (transcript: string, threadId?: string) => {
    setState((prev) => ({ ...prev, isTranscribing: true, error: null }))

    try {
      const response = await fetch('/api/voice/improve-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          thread_id: threadId,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Improvement failed')
      }

      const data = await response.json()

      setState((prev) => ({
        ...prev,
        transcript: data.improved_transcript || transcript,
        isTranscribing: false,
      }))

      return data.improved_transcript || transcript
    } catch (error: any) {
      console.error('Error improving transcript:', error)
      setState((prev) => ({
        ...prev,
        error: error.message || 'Improvement failed',
        isTranscribing: false,
      }))
      throw error
    }
  }, [])

  const reset = useCallback(() => {
    // Stop recording if active
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop()
    }

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    // Clear interval
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    setState({
      isRecording: false,
      isTranscribing: false,
      transcript: null,
      error: null,
      audioBlob: null,
      duration: 0,
    })

    audioChunksRef.current = []
  }, [state.isRecording])

  return {
    ...state,
    startRecording,
    stopRecording,
    transcribeAudio,
    improveTranscript,
    reset,
  }
}



















































