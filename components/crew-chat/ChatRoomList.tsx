// Block 253600 — SmartSend Crew Communication Suite v1
// Component: Chat Room List

'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Building, Briefcase, Shield } from 'lucide-react'

interface ChatRoom {
  id: string
  name: string
  room_type: 'company' | 'job' | 'supervisor' | 'safety'
  description?: string
  updated_at: string
  jobs?: {
    id: string
    stage: string
  }
}

interface ChatRoomListProps {
  companyId: string
  onRoomSelect: (roomId: string) => void
  selectedRoomId?: string
}

export function ChatRoomList({
  companyId,
  onRoomSelect,
  selectedRoomId,
}: ChatRoomListProps) {
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadRooms()
  }, [companyId])

  const loadRooms = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/crew-chat/rooms?company_id=${companyId}`
      )
      const data = await response.json()
      if (data.rooms) {
        setRooms(data.rooms)
      }
    } catch (error) {
      console.error('Error loading rooms:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRoomIcon = (type: string) => {
    switch (type) {
      case 'company':
        return <Building className="h-4 w-4" />
      case 'job':
        return <Briefcase className="h-4 w-4" />
      case 'supervisor':
        return <Shield className="h-4 w-4" />
      case 'safety':
        return <Shield className="h-4 w-4" />
      default:
        return <MessageSquare className="h-4 w-4" />
    }
  }

  const getRoomTypeLabel = (type: string) => {
    switch (type) {
      case 'company':
        return 'Company'
      case 'job':
        return 'Job'
      case 'supervisor':
        return 'Supervisor'
      case 'safety':
        return 'Safety'
      default:
        return type
    }
  }

  if (loading) {
    return <div className="text-center p-4">Loading rooms...</div>
  }

  return (
    <div className="space-y-2">
      {rooms.map((room) => (
        <Card
          key={room.id}
          className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
            selectedRoomId === room.id ? 'bg-blue-50 border-blue-300' : ''
          }`}
          onClick={() => onRoomSelect(room.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className="mt-1">{getRoomIcon(room.room_type)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{room.name}</div>
                {room.description && (
                  <div className="text-sm text-gray-500 truncate">
                    {room.description}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {getRoomTypeLabel(room.room_type)}
                  </Badge>
                  {room.jobs && (
                    <Badge variant="secondary" className="text-xs">
                      {room.jobs.stage}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-400 mt-2">
            {new Date(room.updated_at).toLocaleDateString()}
          </div>
        </Card>
      ))}
      
      {rooms.length === 0 && (
        <div className="text-center p-4 text-gray-500">
          No chat rooms found. Create one to get started!
        </div>
      )}
    </div>
  )
}
























