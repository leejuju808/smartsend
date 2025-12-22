export interface ReplyIntent {
  hasMeetingIntent: boolean
  confidence: number
  suggestedTime?: string
  suggestedDate?: string
  detectedKeywords: string[]
  responseType: 'immediate_ics' | 'human_review' | 'no_action'
}

export interface ICSInvite {
  summary: string
  description: string
  startTime: Date
  endTime: Date
  location?: string
  organizer: {
    name: string
    email: string
  }
  attendee: {
    name: string
    email: string
  }
}

export class ReplyIntentDetector {
  private static readonly MEETING_KEYWORDS = [
    // Direct meeting requests
    'book a meeting', 'schedule a call', 'set up a meeting', 'book a call',
    'schedule a meeting', 'set up a call', 'book time', 'schedule time',
    'meeting', 'call', 'demo', 'discussion', 'conversation',
    
    // Time indicators
    'tomorrow', 'next week', 'this week', 'next month',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    'morning', 'afternoon', 'evening', 'today',
    
    // Availability language
    'available', 'free', 'open', 'when are you free',
    'what works for you', 'let me know when', 'let\'s find time',
    
    // Action words
    'talk', 'discuss', 'go over', 'walk through', 'show you',
    'explain', 'present', 'review', 'explore'
  ]

  private static readonly TIME_PATTERNS = [
    /(?:tomorrow|next week|this week|next month)/i,
    /(?:monday|tuesday|wednesday|thursday|friday)/i,
    /(?:morning|afternoon|evening)/i,
    /(\d{1,2}):(\d{2})\s*(am|pm)/i,
    /(\d{1,2})\s*(am|pm)/i
  ]

  static detectIntent(replyText: string): ReplyIntent {
    const text = replyText.toLowerCase()
    const detectedKeywords: string[] = []
    let confidence = 0
    let suggestedTime: string | undefined
    let suggestedDate: string | undefined

    // Check for meeting keywords
    for (const keyword of this.MEETING_KEYWORDS) {
      if (text.includes(keyword.toLowerCase())) {
        detectedKeywords.push(keyword)
        confidence += 15 // Base confidence per keyword
      }
    }

    // Check for time patterns
    for (const pattern of this.TIME_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        if (pattern.source.includes('tomorrow')) {
          suggestedDate = 'tomorrow'
          confidence += 20
        } else if (pattern.source.includes('next week')) {
          suggestedDate = 'next week'
          confidence += 15
        } else if (pattern.source.includes('monday|tuesday|wednesday|thursday|friday')) {
          suggestedDate = match[0]
          confidence += 15
        } else if (pattern.source.includes('morning|afternoon|evening')) {
          suggestedTime = match[0]
          confidence += 10
        } else if (pattern.source.includes('\\d{1,2}')) {
          suggestedTime = match[0]
          confidence += 20
        }
      }
    }

    // Boost confidence for multiple indicators
    if (detectedKeywords.length > 1) {
      confidence += 10
    }

    // Determine response type based on confidence
    let responseType: ReplyIntent['responseType'] = 'no_action'
    if (confidence >= 70) {
      responseType = 'immediate_ics'
    } else if (confidence >= 40) {
      responseType = 'human_review'
    }

    return {
      hasMeetingIntent: confidence >= 40,
      confidence,
      suggestedTime,
      suggestedDate,
      detectedKeywords,
      responseType
    }
  }

  static generateICS(invite: ICSInvite): string {
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    }

    const escapeText = (text: string) => {
      return text.replace(/[\\;,]/g, '\\$&')
    }

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SmartSend//Reply Intent ICS//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${Date.now()}@smartsend.ai`,
      `DTSTAMP:${formatDate(new Date())}`,
      `DTSTART:${formatDate(invite.startTime)}`,
      `DTEND:${formatDate(invite.endTime)}`,
      `SUMMARY:${escapeText(invite.summary)}`,
      `DESCRIPTION:${escapeText(invite.description)}`,
      invite.location ? `LOCATION:${escapeText(invite.location)}` : '',
      `ORGANIZER;CN="${escapeText(invite.organizer.name)}":mailto:${invite.organizer.email}`,
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN="${escapeText(invite.attendee.name)}":mailto:${invite.attendee.email}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean).join('\r\n')

    return ics
  }

  static generateDefaultInvite(
    contactName: string,
    contactEmail: string,
    organizerName: string,
    organizerEmail: string,
    suggestedTime?: string,
    suggestedDate?: string
  ): ICSInvite {
    const now = new Date()
    let startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000) // Default: tomorrow
    
    // Adjust based on suggestions
    if (suggestedDate === 'tomorrow') {
      startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    } else if (suggestedDate === 'next week') {
      startTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    } else if (suggestedDate && ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(suggestedDate.toLowerCase())) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const targetDay = days.indexOf(suggestedDate.toLowerCase())
      const currentDay = now.getDay()
      const daysToAdd = targetDay > currentDay ? targetDay - currentDay : 7 - currentDay + targetDay
      startTime = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000)
    }

    // Set time based on suggestions or default to 2 PM
    if (suggestedTime) {
      if (suggestedTime.includes('morning')) {
        startTime.setHours(10, 0, 0, 0)
      } else if (suggestedTime.includes('afternoon')) {
        startTime.setHours(14, 0, 0, 0)
      } else if (suggestedTime.includes('evening')) {
        startTime.setHours(17, 0, 0, 0)
      } else {
        // Parse specific time like "2:30 PM"
        const timeMatch = suggestedTime.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/i)
        if (timeMatch) {
          let hour = parseInt(timeMatch[1])
          const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0
          const isPM = timeMatch[3].toLowerCase() === 'pm'
          
          if (isPM && hour !== 12) hour += 12
          if (!isPM && hour === 12) hour = 0
          
          startTime.setHours(hour, minute, 0, 0)
        }
      }
    } else {
      startTime.setHours(14, 0, 0, 0) // Default 2 PM
    }

    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000) // 30 minute meeting

    return {
      summary: `Meeting with ${contactName}`,
      description: `Meeting scheduled via SmartSend reply intent detection.`,
      startTime,
      endTime,
      organizer: {
        name: organizerName,
        email: organizerEmail
      },
      attendee: {
        name: contactName,
        email: contactEmail
      }
    }
  }
} 