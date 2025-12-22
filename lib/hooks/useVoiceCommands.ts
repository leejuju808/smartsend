// Block 20000 — Voice Commands Hook
// Handles voice command recognition and execution

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export interface VoiceCommand {
  command: string
  params?: Record<string, any>
}

export interface UseVoiceCommandsOptions {
  onCommand: (command: string, params?: any) => void
  enabled?: boolean
  continuous?: boolean
}

export function useVoiceCommands({
  onCommand,
  enabled = true,
  continuous = true,
}: UseVoiceCommandsOptions) {
  const [isListening, setIsListening] = useState(false)
  const [lastCommand, setLastCommand] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const processCommand = useCallback(
    (text: string) => {
      const normalized = text.toLowerCase().trim()

      // Command patterns
      const commands: Record<string, RegExp> = {
        send: /^(send|send it|send message)$/i,
        clear: /^(clear|clear message|delete)$/i,
        close: /^(close|exit|done|finish)$/i,
        start_recording: /^(start recording|record|begin recording)$/i,
        stop_recording: /^(stop recording|end recording|stop)$/i,
        reply_yes: /^(reply yes|say yes|yes)$/i,
        reply_no: /^(reply no|say no|no)$/i,
        send_scheduling_options: /^(send scheduling options|send schedule|send times)$/i,
        ask_for_photos: /^(ask for photos|request photos|send photo request)$/i,
        call_them: /^(call them|call|phone)$/i,
        book_appointment: /^(book appointment|schedule|book for|set appointment)\s+(.+)$/i,
        create_followup: /^(create follow.?up|follow up|remind me)\s+(.+)$/i,
        move_to_estimate_scheduled: /^(move to estimate scheduled|mark estimate scheduled)$/i,
        mark_as_hot_lead: /^(mark as hot lead|hot lead|mark hot)$/i,
        show_next_hot_lead: /^(show next hot lead|next hot|hot leads)$/i,
        next_lead: /^(next lead|next)$/i,
        back_to_inbox: /^(back to inbox|go back|inbox)$/i,
        open_calendar: /^(open calendar|calendar|show calendar)$/i,
        show_todays_schedule: /^(show today.?s schedule|today.?s schedule|schedule today)$/i,
        open_tasks: /^(open tasks|tasks|show tasks)$/i,
        show_storm_leads: /^(show storm leads|storm leads)$/i,
        summarize_thread: /^(summarize|summarize thread|summary)$/i,
        attach_last_photo: /^(attach last photo|attach photo|send photo)$/i,
        attach_leak_photo: /^(attach leak photo|attach the leak photo)$/i,
        send_roof_picture: /^(send roof picture|send roof photo)$/i,
        ai_voice_draft: /^(ai voice draft|generate reply|ai draft|voice draft)$/i,
        generate_reply: /^(generate reply|ai reply)$/i,
        // Template activations
        template_in_area: /^(we.?re in your area|in area today|in your area)$/i,
        template_insurance: /^(we can help with insurance|insurance help|insurance claim)$/i,
        template_tomorrow: /^(we can come tomorrow|tomorrow morning|come tomorrow)$/i,
        template_photos: /^(send photos|send us photos|photo request|photos of damage)$/i,
        template_estimate: /^(estimate scheduled|scheduled confirmation)$/i,
        template_followup: /^(follow up|following up|still interested)$/i,
      }

      // Check each command pattern
      for (const [command, pattern] of Object.entries(commands)) {
        const match = normalized.match(pattern)
        if (match) {
          setLastCommand(command)
          onCommand(command, match[2] ? { text: match[2] } : undefined)
          return true
        }
      }

      return false
    },
    [onCommand]
  )

  const startListening = useCallback(() => {
    if (!enabled) return

    // Check browser support
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = continuous
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastResult = event.results[event.results.length - 1]
      const transcript = lastResult[0].transcript

      if (lastResult.isFinal) {
        processCommand(transcript)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      if (continuous && enabled) {
        // Restart if continuous mode
        setTimeout(() => {
          if (enabled) {
            startListening()
          }
        }, 100)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [enabled, continuous, processCommand])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  useEffect(() => {
    return () => {
      stopListening()
    }
  }, [stopListening])

  return {
    isListening,
    startListening,
    stopListening,
    lastCommand,
  }
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

