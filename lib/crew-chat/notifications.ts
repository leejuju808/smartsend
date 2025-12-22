// Block 253600 — SmartSend Crew Communication Suite v1
// Notification helpers for chat events

import { createClient } from '@/lib/supabase/server'

export interface ChatNotification {
  type: 'new_message' | 'supervisor_alert' | 'job_chat_created' | 'summary_ready'
  room_id: string
  room_name?: string
  message?: string
  alert_id?: string
  job_id?: string
  user_id: string
}

/**
 * Send notification for chat events
 * This can be extended to integrate with your existing notification system
 */
export async function sendChatNotification(notification: ChatNotification) {
  try {
    const supabase = await createClient()

    // Create notification record (if you have a notifications table)
    // This is a placeholder - adjust based on your notification system
    const { error } = await supabase.from('notifications').insert({
      user_id: notification.user_id,
      type: notification.type,
      title: getNotificationTitle(notification),
      message: notification.message || '',
      metadata: {
        room_id: notification.room_id,
        room_name: notification.room_name,
        alert_id: notification.alert_id,
        job_id: notification.job_id,
      },
      read: false,
    })

    if (error) {
      console.error('Error creating notification:', error)
    }

    // You can also integrate with:
    // - Push notifications (FCM, APNS)
    // - Email notifications
    // - SMS notifications
    // - In-app notification system
  } catch (error) {
    console.error('Error sending chat notification:', error)
  }
}

function getNotificationTitle(notification: ChatNotification): string {
  switch (notification.type) {
    case 'new_message':
      return `New message in ${notification.room_name || 'chat'}`
    case 'supervisor_alert':
      return `🚨 Supervisor Alert: ${notification.room_name || 'Job'}`
    case 'job_chat_created':
      return `New job chat created: ${notification.room_name || 'Job'}`
    case 'summary_ready':
      return `Daily summary ready: ${notification.room_name || 'Chat'}`
    default:
      return 'New chat notification'
  }
}

/**
 * Notify supervisors of new alerts
 */
export async function notifySupervisorsOfAlert(
  companyId: string,
  alertId: string
) {
  try {
    const supabase = await createClient()

    // Get alert details
    const { data: alert } = await supabase
      .from('supervisor_alerts')
      .select('*, jobs:job_id(id), chat_rooms:room_id(name)')
      .eq('id', alertId)
      .single()

    if (!alert) return

    // Get all supervisors (PMs and foremen)
    const { data: supervisors } = await supabase
      .from('workforce_employees')
      .select('id, email, role')
      .eq('company_id', companyId)
      .in('role', ['project_manager', 'foreman'])
      .eq('status', 'active')

    if (!supervisors) return

    // Get user IDs for supervisors
    const userIds: string[] = []
    for (const supervisor of supervisors) {
      if (supervisor.email) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('email', supervisor.email)
          .single()

        if (user) {
          userIds.push(user.id)
        }
      }
    }

    // Send notifications
    for (const userId of userIds) {
      await sendChatNotification({
        type: 'supervisor_alert',
        room_id: alert.room_id || '',
        room_name: alert.chat_rooms?.name || 'Job',
        message: alert.message,
        alert_id: alertId,
        job_id: alert.job_id || undefined,
        user_id: userId,
      })
    }

    // Update alert notification status
    await supabase
      .from('supervisor_alerts')
      .update({
        notified_users: userIds,
        notified_at: new Date().toISOString(),
      })
      .eq('id', alertId)
  } catch (error) {
    console.error('Error notifying supervisors:', error)
  }
}

/**
 * Notify room members of new message
 */
export async function notifyRoomMembers(
  roomId: string,
  messageId: string,
  excludeUserId?: string
) {
  try {
    const supabase = await createClient()

    // Get room details
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('name')
      .eq('id', roomId)
      .single()

    // Get message details
    const { data: message } = await supabase
      .from('chat_messages')
      .select('message, employee_id, user_id')
      .eq('id', messageId)
      .single()

    if (!room || !message) return

    // Get all room members
    const { data: members } = await supabase
      .from('chat_room_members')
      .select('employee_id, user_id')
      .eq('room_id', roomId)

    if (!members) return

    // Send notifications to members (excluding sender)
    for (const member of members) {
      const userId = member.user_id
      if (userId && userId !== excludeUserId && userId !== message.user_id) {
        await sendChatNotification({
          type: 'new_message',
          room_id: roomId,
          room_name: room.name,
          message: message.message.substring(0, 100), // First 100 chars
          user_id: userId,
        })
      }
    }
  } catch (error) {
    console.error('Error notifying room members:', error)
  }
}
























