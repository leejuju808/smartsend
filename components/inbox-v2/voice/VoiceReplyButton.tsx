// Block 20000 — Voice Reply Button Component
// One-tap voice recording button for inbox composer

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { useVoiceRecording } from '@/lib/hooks/useVoiceRecording'
import { toast } from 'sonner'

interface VoiceReplyButtonProps {
  onTranscriptReady: (transcript: string) => void
  onImproveTranscript?: (transcript: string) => Promise<string>
  threadId?: string
  disabled?: boolean
}

export function VoiceReplyButton({
  onTranscriptReady,
  onImproveTranscript,
  threadId,
  disabled = false,
}: VoiceReplyButtonProps) {
  const {
    isRecording,
    isTranscribing,
    transcript,
    error,
    audioBlob,
    duration,
    startRecording,
    stopRecording,
    transcribeAudio,
    improveTranscript,
    reset,
  } = useVoiceRecording()

  const [isImproving, setIsImproving] = useState(false)

  // Auto-transcribe when recording stops
  useEffect(() => {
    if (!isRecording && audioBlob && !transcript && !isTranscribing) {
      handleTranscribe()
    }
  }, [isRecording, audioBlob])

  // Auto-improve transcript when ready
  useEffect(() => {
    if (transcript && !isImproving && onImproveTranscript) {
      handleImprove()
    } else if (transcript && !isImproving && !onImproveTranscript) {
      // If no improve function, use transcript directly
      onTranscriptReady(transcript)
      reset()
    }
  }, [transcript])

  // Show errors
  useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  const handleTranscribe = async () => {
    if (!audioBlob) return

    try {
      const result = await transcribeAudio(audioBlob)
      // Transcript will be handled by useEffect
    } catch (error) {
      console.error('Transcription failed:', error)
    }
  }

  const handleImprove = async () => {
    if (!transcript) return

    setIsImproving(true)
    try {
      let improved: string

      if (onImproveTranscript) {
        improved = await onImproveTranscript(transcript)
      } else {
        improved = await improveTranscript(transcript, threadId)
      }

      onTranscriptReady(improved)
      reset()
      toast.success('Voice message ready')
    } catch (error: any) {
      console.error('Improvement failed:', error)
      // Fallback to original transcript
      onTranscriptReady(transcript)
      reset()
    } finally {
      setIsImproving(false)
    }
  }

  const handleClick = () => {
    if (isRecording) {
      stopRecording()
    } else {
      reset()
      startRecording()
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={isRecording ? 'destructive' : 'outline'}
        size="sm"
        onClick={handleClick}
        disabled={disabled || isTranscribing || isImproving}
        className={`relative ${isRecording ? 'animate-pulse' : ''}`}
      >
        {isRecording ? (
          <>
            <MicOff className="w-4 h-4 mr-2" />
            {formatDuration(duration)}
          </>
        ) : isTranscribing || isImproving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {isTranscribing ? 'Transcribing...' : 'Improving...'}
          </>
        ) : (
          <>
            <Mic className="w-4 h-4 mr-2" />
            Voice Reply
          </>
        )}
      </Button>
    </div>
  )
}



















































