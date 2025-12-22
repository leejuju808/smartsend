// Block 253600 — SmartSend Crew Communication Suite v1
// Component: Chat Room UI

'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Send, Image as ImageIcon, Mic, Search } from 'lucide-react'
import Image from 'next/image'

interface ChatMessage {
  id: string
  message: string
  photo_url?: string
  audio_url?: string
  ai_photo_note?: string
  ai_transcription?: string
  translated_message?: string
  detected_language?: string
  message_type: 'text' | 'photo' | 'audio' | 'system'
  created_at: string
  workforce_employees?: {
    first_name: string
    last_name: string
    role: string
  }
}

interface ChatRoomProps {
  roomId: string
  companyId: string
}

export function ChatRoom({ roomId, companyId }: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMessages()
    // Set up real-time subscription
    const supabase = (window as any).supabase
    if (supabase) {
      const channel = supabase
        .channel(`chat:${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `room_id=eq.${roomId}`,
          },
          (payload: any) => {
            setMessages((prev) => [...prev, payload.new])
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [roomId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadMessages = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/crew-chat/messages?room_id=${roomId}`
      )
      const data = await response.json()
      if (data.messages) {
        setMessages(data.messages)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return

    const messageText = newMessage
    setNewMessage('')

    try {
      const response = await fetch('/api/crew-chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          message: messageText,
          message_type: 'text',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setNewMessage(messageText) // Restore message on error
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      // Upload to storage (you'll need to implement this)
      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      })

      const { url } = await uploadResponse.json()

      // Send message with photo
      await fetch('/api/crew-chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          message: 'Photo uploaded',
          photo_url: url,
          message_type: 'photo',
        }),
      })
    } catch (error) {
      console.error('Error uploading photo:', error)
    } finally {
      setUploading(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <Card className="flex flex-col h-[600px]">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && <div className="text-center text-sm text-gray-500">Loading messages...</div>}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.workforce_employees ? 'justify-start' : 'justify-end'}`}
          >
            <div className={`max-w-[70%] ${msg.workforce_employees ? '' : 'bg-blue-500 text-white rounded-lg p-3'}`}>
              {msg.workforce_employees && (
                <div className="text-xs font-semibold mb-1">
                  {msg.workforce_employees.first_name} {msg.workforce_employees.last_name}
                  <span className="text-gray-500 ml-2">
                    ({msg.workforce_employees.role})
                  </span>
                </div>
              )}
              
              {msg.photo_url && (
                <div className="mb-2">
                  <Image
                    src={msg.photo_url}
                    alt="Chat photo"
                    width={300}
                    height={200}
                    className="rounded-lg"
                  />
                  {msg.ai_photo_note && (
                    <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                      <strong>AI Note:</strong>
                      <div className="whitespace-pre-line">{msg.ai_photo_note}</div>
                    </div>
                  )}
                </div>
              )}
              
              {msg.audio_url && (
                <div className="mb-2">
                  <audio controls src={msg.audio_url} className="w-full" />
                  {msg.ai_transcription && (
                    <div className="mt-2 p-2 bg-green-50 rounded text-sm">
                      <strong>Transcription:</strong>
                      <div>{msg.ai_transcription}</div>
                    </div>
                  )}
                </div>
              )}
              
              <div className={msg.workforce_employees ? 'bg-gray-100 rounded-lg p-3' : ''}>
                {msg.ai_transcription || msg.message}
              </div>
              
              {msg.translated_message && (
                <div className="mt-2 p-2 bg-yellow-50 rounded text-sm italic">
                  <strong>Translation:</strong> {msg.translated_message}
                </div>
              )}
              
              <div className="text-xs text-gray-500 mt-1">
                {formatTime(msg.created_at)}
              </div>
            </div>
          </div>
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Type a message..."
            disabled={uploading}
          />
          
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
              disabled={uploading}
            />
            <Button variant="outline" size="icon" disabled={uploading}>
              <ImageIcon className="h-4 w-4" />
            </Button>
          </label>
          
          <Button onClick={sendMessage} disabled={uploading || !newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
























