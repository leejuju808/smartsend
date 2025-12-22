// Block 20000 — Hands-Free Mode Component
// Special UI for voice-only interaction on mobile

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Send, X, Volume2 } from 'lucide-react'
import { useVoiceRecording } from '@/lib/hooks/useVoiceRecording'
import { toast } from 'sonner'
import { useVoiceCommands } from '@/lib/hooks/useVoiceCommands'
import { useVoiceNavigation } from '@/lib/hooks/useVoiceNavigation'
import { VoiceSafetyLayer, createSafetyConfirmation, HIGH_IMPACT_ACTIONS } from './VoiceSafetyLayer'
import { VOICE_TEMPLATES } from './VoiceTemplates'

interface HandsFreeModeProps {
  isActive: boolean
  onClose: () => void
  onSend: (message: string) => void
  threadId?: string
  contactName?: string
}

export function HandsFreeMode({
  isActive,
  onClose,
  onSend,
  threadId,
  contactName,
}: HandsFreeModeProps) {
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

  const { handleNavigationCommand } = useVoiceNavigation()
  const [safetyConfirmation, setSafetyConfirmation] = useState<any>(null)
  const [isImproving, setIsImproving] = useState(false)

  const { isListening, startListening, stopListening, lastCommand } = useVoiceCommands({
    onCommand: handleVoiceCommand,
  })

  const [currentMessage, setCurrentMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [aiReplyType, setAiReplyType] = useState<string | null>(null)
  const [isGeneratingAIReply, setIsGeneratingAIReply] = useState(false)

  useEffect(() => {
    if (isActive) {
      // Auto-start voice listening when mode activates
      startListening()
    } else {
      stopListening()
      reset()
    }
  }, [isActive])

  useEffect(() => {
    if (transcript && !isTranscribing) {
      // Auto-improve and set message
      handleImproveAndSet(transcript)
    }
  }, [transcript, isTranscribing])

  async function handleImproveAndSet(text: string) {
    try {
      const improved = await improveTranscript(text, threadId)
      setCurrentMessage(improved)
      // Speak confirmation
      speakText('Message ready. Say send to send it.')
    } catch (error) {
      setCurrentMessage(text)
      speakText('Message ready.')
    }
  }

  function handleVoiceCommand(command: string, params?: any) {
    // Check if this is a high-impact action requiring confirmation
    if (HIGH_IMPACT_ACTIONS.includes(command) && !safetyConfirmation) {
      const confirmation = createSafetyConfirmation(command, {
        message: getConfirmationMessage(command, params),
        severity: command === 'send' ? 'high' : 'medium',
        onConfirm: () => {
          executeCommand(command, params)
        },
        onCancel: () => {
          speakText('Action cancelled.')
        },
      })
      setSafetyConfirmation(confirmation)
      return
    }

    // Execute command directly if not high-impact or already confirmed
    executeCommand(command, params)
  }

  function executeCommand(command: string, params?: any) {
    switch (command) {
      case 'send':
        if (currentMessage.trim()) {
          handleSend()
        } else {
          speakText('No message to send. Please record a message first.')
        }
        break
      case 'clear':
        setCurrentMessage('')
        speakText('Message cleared.')
        break
      case 'start_recording':
        if (!isRecording) {
          startRecording()
          speakText('Recording started.')
        }
        break
      case 'stop_recording':
        if (isRecording) {
          stopRecording()
          speakText('Recording stopped.')
        }
        break
      case 'close':
        onClose()
        break
      case 'summarize_thread':
        handleSummarizeThread()
        break
      case 'attach_last_photo':
      case 'attach_leak_photo':
      case 'send_roof_picture':
        handleAttachPhoto(command)
        break
      case 'ai_voice_draft':
      case 'generate_reply':
        handleAIVoiceDraft()
        break
      case 'send_scheduling_options':
        handleAIVoiceDraft('scheduling')
        break
      case 'ask_for_photos':
        handleAIVoiceDraft('photo_request')
        break
      case 'reply_yes':
        setCurrentMessage('Yes')
        speakText('Reply set to yes. Say send to send it.')
        break
      case 'reply_no':
        setCurrentMessage('No')
        speakText('Reply set to no. Say send to send it.')
        break
      case 'book_appointment':
        handleBookAppointment(params?.text)
        break
      case 'create_followup':
        handleCreateFollowup(params?.text)
        break
      case 'move_to_estimate_scheduled':
        handlePipelineAction('estimate_scheduled')
        break
      case 'mark_as_hot_lead':
        handlePipelineAction('hot_lead')
        break
      case 'template_in_area':
        handleTemplateActivation('in_area_today')
        break
      case 'template_insurance':
        handleTemplateActivation('insurance_help')
        break
      case 'template_tomorrow':
        handleTemplateActivation('tomorrow_morning')
        break
      case 'template_photos':
        handleTemplateActivation('photo_request')
        break
      case 'template_estimate':
        handleTemplateActivation('estimate_scheduled')
        break
      case 'template_followup':
        handleTemplateActivation('follow_up')
        break
      default:
        // Try navigation commands
        const navResult = handleNavigationCommand(command, params)
        if (navResult) {
          speakText('Navigating...')
        }
        break
    }
  }

  function getConfirmationMessage(command: string, params?: any): string {
    switch (command) {
      case 'send':
        return 'Are you sure you want to send this message?'
      case 'mark_as_closed':
        return 'Are you sure you want to mark this job as closed?'
      case 'delete_thread':
        return 'Are you sure you want to delete this thread?'
      default:
        return `Are you sure you want to ${command.replace(/_/g, ' ')}?`
    }
  }

  async function handleSummarizeThread() {
    if (!threadId) return

    try {
      const res = await fetch('/api/voice/summarize-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId }),
      })

      if (res.ok) {
        const data = await res.json()
        speakText(data.summary)
      }
    } catch (error) {
      speakText('Failed to summarize thread.')
    }
  }

  async function handleAttachPhoto(command: string) {
    if (!threadId) return

    try {
      const photoType = command.replace('attach_', '').replace('send_', '').replace('_photo', '').replace('_picture', '')
      const res = await fetch('/api/voice/photo-attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          photo_type: photoType,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        speakText(`Photo attached: ${data.file_name}`)
        // Photo would be attached to current message
      } else {
        speakText('No photos found in this thread.')
      }
    } catch (error) {
      speakText('Failed to attach photo.')
    }
  }

  async function handleAIVoiceDraft(replyType?: string) {
    if (!threadId) return

    setIsGeneratingAIReply(true)
    try {
      const res = await fetch('/api/voice/ai-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          reply_type: replyType || 'quick_response',
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setCurrentMessage(data.reply)
        setAiReplyType(data.reply_type)
        
        // Speak the AI-generated reply
        speakText(`AI draft ready: ${data.reply}`)
        speakText('Say send to send it, or say clear to start over.')
      } else {
        speakText('Failed to generate AI reply.')
      }
    } catch (error) {
      speakText('Failed to generate AI reply.')
    } finally {
      setIsGeneratingAIReply(false)
    }
  }

  async function handleBookAppointment(timeText?: string) {
    if (!threadId) return

    try {
      // Parse time from voice command
      const appointmentTime = timeText || 'tomorrow at 10 AM'
      
      // Create appointment via API
      const res = await fetch(`/api/inbox-v2/threads/${threadId}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time: appointmentTime,
        }),
      })

      if (res.ok) {
        speakText(`Appointment scheduled for ${appointmentTime}.`)
        // Optionally send confirmation message
        const confirmMessage = `Great! We have you scheduled for ${appointmentTime}. We'll send you a confirmation shortly.`
        setCurrentMessage(confirmMessage)
      } else {
        speakText('Failed to book appointment.')
      }
    } catch (error) {
      speakText('Failed to book appointment.')
    }
  }

  async function handleCreateFollowup(dateText?: string) {
    if (!threadId) return

    try {
      const followupDate = dateText || 'Friday'
      
      const res = await fetch(`/api/inbox-v2/threads/${threadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          title: `Follow up on ${followupDate}`,
          due_date: followupDate,
        }),
      })

      if (res.ok) {
        speakText(`Follow-up task created for ${followupDate}.`)
      } else {
        speakText('Failed to create follow-up.')
      }
    } catch (error) {
      speakText('Failed to create follow-up.')
    }
  }

  async function handlePipelineAction(stage: string) {
    if (!threadId) return

    try {
      const res = await fetch(`/api/inbox-v2/threads/${threadId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })

      if (res.ok) {
        speakText(`Moved to ${stage.replace(/_/g, ' ')}.`)
      } else {
        speakText('Failed to update pipeline.')
      }
    } catch (error) {
      speakText('Failed to update pipeline.')
    }
  }

  function handleTemplateActivation(templateId: string) {
    const template = VOICE_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      setCurrentMessage(template.text)
      speakText(`Template activated: ${template.text.substring(0, 50)}... Say send to send it.`)
    } else {
      speakText('Template not found.')
    }
  }

  async function handleSend() {
    if (!currentMessage.trim() || isSending) return

    setIsSending(true)
    try {
      await onSend(currentMessage)
      setCurrentMessage('')
      reset()
      speakText('Message sent successfully.')
    } catch (error) {
      speakText('Failed to send message.')
      toast.error('Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  function speakText(text: string) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0
      window.speechSynthesis.speak(utterance)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isActive) return null

  return (
    <>
      {/* Safety Layer */}
      {safetyConfirmation && (
        <VoiceSafetyLayer
          confirmation={safetyConfirmation}
          onResolve={() => setSafetyConfirmation(null)}
        />
      )}

      <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      {/* Close Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:bg-white/20"
      >
        <X className="w-5 h-5" />
      </Button>

      {/* Contact Name */}
      {contactName && (
        <div className="text-white text-xl font-semibold mb-8">
          {contactName}
        </div>
      )}

      {/* Status */}
      <div className="text-white/70 text-sm mb-8 text-center">
        {isGeneratingAIReply ? (
          <span>Generating AI reply...</span>
        ) : isRecording ? (
          <span>Recording... {formatDuration(duration)}</span>
        ) : isTranscribing ? (
          <span>Transcribing...</span>
        ) : isListening ? (
          <span>Listening for commands...</span>
        ) : (
          <span>Ready</span>
        )}
      </div>

      {/* Current Message Preview */}
      {currentMessage && (
        <div className="bg-white/10 rounded-lg p-4 mb-8 max-w-md w-full">
          <div className="text-white text-sm whitespace-pre-wrap">
            {currentMessage}
          </div>
        </div>
      )}

      {/* Large Microphone Button */}
      <div className="flex flex-col items-center gap-6">
        <Button
          size="lg"
          variant={isRecording ? 'destructive' : 'default'}
          onClick={() => {
            if (isRecording) {
              stopRecording()
            } else {
              startRecording()
            }
          }}
          disabled={isTranscribing || isSending}
          className={`w-32 h-32 rounded-full ${
            isRecording ? 'animate-pulse' : ''
          }`}
        >
          {isRecording ? (
            <MicOff className="w-12 h-12" />
          ) : (
            <Mic className="w-12 h-12" />
          )}
        </Button>

        {/* Send Button */}
        {currentMessage && (
          <Button
            size="lg"
            onClick={handleSend}
            disabled={isSending || !currentMessage.trim()}
            className="w-32 h-16 text-lg"
          >
            <Send className="w-6 h-6 mr-2" />
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        )}
      </div>

      {/* AI Voice Draft Button */}
      {!currentMessage && (
        <div className="mt-4">
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleAIVoiceDraft()}
            disabled={isGeneratingAIReply}
            className="bg-white/10 text-white border-white/20 hover:bg-white/20"
          >
            <Volume2 className="w-5 h-5 mr-2" />
            {isGeneratingAIReply ? 'Generating...' : 'AI Voice Draft'}
          </Button>
        </div>
      )}

      {/* Voice Commands Help */}
      <div className="mt-8 text-white/50 text-xs text-center max-w-md">
        <p className="mb-2 font-semibold">Voice Commands:</p>
        <p>"Send", "Clear", "Close", "Summarize", "Attach Photo"</p>
        <p>"AI Voice Draft", "Send Scheduling Options", "Ask for Photos"</p>
        <p>"Book Appointment", "Mark as Hot Lead", "Next Lead"</p>
      </div>
      </div>
    </>
  )
}

