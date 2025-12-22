import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/messaging-hub/tasks/create-from-message
 * Automatically detect action items in a message and create tasks
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id, user } = gate
    const user_id = user.id
    const supabase = getServerSupabase()

    const body = await req.json()
    const { message_id } = body

    if (!message_id) {
      return NextResponse.json(
        { error: 'message_id is required' },
        { status: 400 }
      )
    }

    // Get the message
    const { data: message, error: messageError } = await supabase
      .from('unified_messages')
      .select('*')
      .eq('id', message_id)
      .eq('workspace_id', workspace_id)
      .single()

    if (messageError || !message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    const messageText = message.body_text || message.body_html || ''
    const detectedTasks = []

    // Use AI to detect action items
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (OPENAI_API_KEY) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a task detection system for a roofing company. Analyze the message and extract action items. Return a JSON array of tasks, each with: title, description (optional), due_date (optional, in ISO format), priority (low/normal/high). If no action items are found, return an empty array.'
              },
              {
                role: 'user',
                content: `Message: "${messageText}"\n\nExtract action items and return as JSON array.`
              }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 500
          })
        })

        if (response.ok) {
          const data = await response.json()
          const content = JSON.parse(data.choices[0]?.message?.content || '{}')
          const tasks = content.tasks || []

          // Create tasks
          for (const task of tasks) {
            // Determine which task table to use (check if tasks table exists)
            // For now, we'll use a generic approach
            const taskTitle = task.title || 'Follow up on message'
            const taskDescription = task.description || `Created from message: ${message.subject || 'No subject'}`
            const taskDueAt = task.due_date ? new Date(task.due_date).toISOString() : null
            const taskPriority = task.priority || 'normal'

            // Try to insert into tasks table (adjust table name based on your schema)
            const { data: createdTask, error: taskError } = await supabase
              .from('tasks')
              .insert({
                workspace_id,
                title: taskTitle,
                description: taskDescription,
                due_at: taskDueAt,
                priority: taskPriority,
                status: 'pending',
                created_by: user_id,
                assigned_to: message.assigned_to || user_id,
                lead_id: message.lead_id,
                job_id: message.job_id,
                contact_id: message.contact_id
              })
              .select()
              .single()

            if (!taskError && createdTask) {
              // Log the task creation
              await supabase
                .from('message_task_creations')
                .insert({
                  workspace_id,
                  message_id,
                  task_id: createdTask.id,
                  task_title: taskTitle,
                  task_description: taskDescription,
                  task_due_at: taskDueAt,
                  task_assigned_to: message.assigned_to || user_id,
                  detection_method: 'ai',
                  detected_action_item: taskTitle
                })

              detectedTasks.push(createdTask)
            }
          }
        }
      } catch (error) {
        console.error('Error detecting tasks with AI:', error)
        // Fall through to keyword-based detection
      }
    }

    // Fallback: Keyword-based detection
    if (detectedTasks.length === 0) {
      const keywords = {
        'call': ['call me', 'please call', 'call back', 'give me a call'],
        'schedule': ['schedule', 'appointment', 'inspection', 'when can you'],
        'quote': ['quote', 'estimate', 'pricing', 'how much'],
        'follow up': ['follow up', 'check back', 'get back to me']
      }

      for (const [action, patterns] of Object.entries(keywords)) {
        for (const pattern of patterns) {
          if (messageText.toLowerCase().includes(pattern)) {
            const { data: createdTask, error: taskError } = await supabase
              .from('tasks')
              .insert({
                workspace_id,
                title: `Action: ${action}`,
                description: `Created from message: ${message.subject || 'No subject'}`,
                status: 'pending',
                created_by: user_id,
                assigned_to: message.assigned_to || user_id,
                lead_id: message.lead_id,
                job_id: message.job_id,
                contact_id: message.contact_id
              })
              .select()
              .single()

            if (!taskError && createdTask) {
              await supabase
                .from('message_task_creations')
                .insert({
                  workspace_id,
                  message_id,
                  task_id: createdTask.id,
                  task_title: `Action: ${action}`,
                  detection_method: 'keyword',
                  detected_action_item: action
                })

              detectedTasks.push(createdTask)
              break // Only create one task per keyword match
            }
          }
        }
      }
    }

    return NextResponse.json({
      tasks: detectedTasks,
      message_id
    })
  } catch (error) {
    console.error('Error in POST /api/messaging-hub/tasks/create-from-message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

