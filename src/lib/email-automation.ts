import { createClientComponentClient } from '@/lib/supabase'
import { checkFeatureAccess, recordUsage } from './usage'

export interface EmailSequence {
  id: string
  name: string
  description: string
  steps: SequenceStep[]
  totalEmails: number
  estimatedDays: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface SequenceStep {
  id: string
  order: number
  delayDays: number
  delayHours: number
  subject: string
  body: string
  templateId?: string
  conditions?: StepCondition[]
}

export interface StepCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than'
  value: string | number
}

export interface CampaignContact {
  id: string
  email: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
  customFields: Record<string, any>
  status: 'pending' | 'sent' | 'opened' | 'replied' | 'bounced' | 'unsubscribed'
  currentStep: number
  lastEmailSent?: Date
  nextEmailDate?: Date
}

export interface EmailMetrics {
  sent: number
  delivered: number
  opened: number
  clicked: number
  replied: number
  bounced: number
  unsubscribed: number
  openRate: number
  clickRate: number
  replyRate: number
}

/**
 * Create a new email sequence
 */
export async function createSequence(
  userId: string,
  data: {
    name: string
    description: string
    steps: Omit<SequenceStep, 'id'>[]
  }
): Promise<EmailSequence> {
  // Check if user can create sequences
  const access = await checkFeatureAccess(userId, 'sequence_create')
  if (!access.allowed) {
    throw new Error(`Cannot create sequence: ${access.message}`)
  }

  const supabase = createClientComponentClient()
  
  // Calculate sequence metrics
  const totalEmails = data.steps.length
  const estimatedDays = data.steps.reduce((total, step) => total + step.delayDays, 0)
  
  // Create sequence
  const { data: sequence, error } = await supabase
    .from('sequences')
    .insert({
      user_id: userId,
      name: data.name,
      description: data.description,
      total_emails: totalEmails,
      estimated_days: estimatedDays,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) throw error

  // Create sequence steps
  const stepsWithIds = data.steps.map((step, index) => ({
    ...step,
    id: `${sequence.id}_step_${index}`,
    sequence_id: sequence.id,
    order: index + 1
  }))

  const { error: stepsError } = await supabase
    .from('sequence_steps')
    .insert(stepsWithIds)

  if (stepsError) throw stepsError

  // Record usage
  await recordUsage(userId, 'sequence_create')

  return {
    ...sequence,
    steps: stepsWithIds,
    createdAt: new Date(sequence.created_at),
    updatedAt: new Date(sequence.updated_at)
  }
}

/**
 * Add contacts to a sequence
 */
export async function addContactsToSequence(
  userId: string,
  sequenceId: string,
  contactIds: string[]
): Promise<void> {
  const supabase = createClientComponentClient()
  
  // Verify sequence ownership
  const { data: sequence } = await supabase
    .from('sequences')
    .select('id')
    .eq('id', sequenceId)
    .eq('user_id', userId)
    .single()

  if (!sequence) {
    throw new Error('Sequence not found or access denied')
  }

  // Add contacts to sequence
  const sequenceContacts = contactIds.map(contactId => ({
    sequence_id: sequenceId,
    contact_id: contactId,
    status: 'pending',
    current_step: 1,
    next_email_date: new Date().toISOString(),
    created_at: new Date().toISOString()
  }))

  const { error } = await supabase
    .from('sequence_contacts')
    .insert(sequenceContacts)

  if (error) throw error
}

/**
 * Process sequence emails (called by cron job)
 */
export async function processSequenceEmails(): Promise<void> {
  const supabase = createClientComponentClient()
  
  const now = new Date()
  
  // Get contacts ready for next email
  const { data: readyContacts } = await supabase
    .from('sequence_contacts')
    .select(`
      *,
      sequences!inner(*),
      contacts!inner(*),
      sequence_steps!inner(*)
    `)
    .eq('status', 'pending')
    .lte('next_email_date', now.toISOString())
    .order('next_email_date', { ascending: true })

  if (!readyContacts) return

  for (const contact of readyContacts) {
    try {
      await sendSequenceEmail(contact)
    } catch (error) {
      console.error(`Failed to send sequence email to ${contact.contacts.email}:`, error)
      
      // Mark as failed and move to next step
      await supabase
        .from('sequence_contacts')
        .update({ 
          status: 'failed',
          updated_at: now.toISOString()
        })
        .eq('id', contact.id)
    }
  }
}

/**
 * Send a single sequence email
 */
async function sendSequenceEmail(contact: any): Promise<void> {
  const supabase = createClientComponentClient()
  
  const sequence = contact.sequences
  const sequenceStep = contact.sequence_steps.find((step: any) => step.order === contact.current_step)
  
  if (!sequenceStep) {
    throw new Error('Sequence step not found')
  }

  // Personalize email content
  const personalizedSubject = personalizeContent(sequenceStep.subject, contact.contacts)
  const personalizedBody = personalizeContent(sequenceStep.body, contact.contacts)

  // Send email (integrate with your email service)
  const emailResult = await sendEmail({
    to: contact.contacts.email,
    subject: personalizedSubject,
    body: personalizedBody,
    from: sequence.from_email || 'noreply@yourdomain.com',
    replyTo: sequence.reply_to_email
  })

  if (emailResult.success) {
    // Update contact status
    const nextStep = contact.current_step + 1
    const isLastStep = nextStep > sequence.total_emails
    
    if (isLastStep) {
      // Sequence completed
      await supabase
        .from('sequence_contacts')
        .update({ 
          status: 'completed',
          current_step: nextStep - 1,
          last_email_sent: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', contact.id)
    } else {
      // Schedule next email
      const nextEmailDate = calculateNextEmailDate(sequenceStep)
      await supabase
        .from('sequence_contacts')
        .update({ 
          current_step: nextStep,
          next_email_date: nextEmailDate.toISOString(),
          last_email_sent: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', contact.id)
    }

    // Record email send
    await recordUsage(contact.sequences.user_id, 'email_send')
  } else {
    throw new Error(`Failed to send email: ${emailResult.error}`)
  }
}

/**
 * Personalize email content with contact data
 */
function personalizeContent(content: string, contact: any): string {
  let personalized = content
  
  // Replace basic variables
  personalized = personalized.replace(/\{\{first_name\}\}/g, contact.firstName || 'there')
  personalized = personalized.replace(/\{\{last_name\}\}/g, contact.lastName || '')
  personalized = personalized.replace(/\{\{company\}\}/g, contact.company || 'your company')
  personalized = personalized.replace(/\{\{title\}\}/g, contact.title || '')
  
  // Replace custom fields
  if (contact.customFields) {
    Object.entries(contact.customFields).forEach(([key, value]) => {
      personalized = personalized.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value || ''))
    })
  }
  
  return personalized
}

/**
 * Calculate next email date based on step delay
 */
function calculateNextEmailDate(step: SequenceStep): Date {
  const now = new Date()
  const delayMs = (step.delayDays * 24 * 60 * 60 * 1000) + (step.delayHours * 60 * 60 * 1000)
  return new Date(now.getTime() + delayMs)
}

/**
 * Send email (integrate with your email service)
 */
async function sendEmail(data: {
  to: string
  subject: string
  body: string
  from: string
  replyTo?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Integrate with your email service (Resend, SendGrid, etc.)
    // This is a placeholder implementation
    const response = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    if (response.ok) {
      return { success: true }
    } else {
      const error = await response.text()
      return { success: false, error }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Get sequence analytics
 */
export async function getSequenceAnalytics(
  userId: string,
  sequenceId: string
): Promise<EmailMetrics> {
  const supabase = createClientComponentClient()
  
  // Verify sequence ownership
  const { data: sequence } = await supabase
    .from('sequences')
    .select('id')
    .eq('id', sequenceId)
    .eq('user_id', userId)
    .single()

  if (!sequence) {
    throw new Error('Sequence not found or access denied')
  }

  // Get sequence contacts
  const { data: contacts } = await supabase
    .from('sequence_contacts')
    .select('status')
    .eq('sequence_id', sequenceId)

  if (!contacts) {
    return {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
      unsubscribed: 0,
      openRate: 0,
      clickRate: 0,
      replyRate: 0
    }
  }

  const total = contacts.length
  const sent = contacts.filter(c => c.status !== 'pending').length
  const delivered = contacts.filter(c => ['sent', 'opened', 'clicked', 'replied'].includes(c.status)).length
  const opened = contacts.filter(c => ['opened', 'clicked', 'replied'].includes(c.status)).length
  const clicked = contacts.filter(c => ['clicked', 'replied'].includes(c.status)).length
  const replied = contacts.filter(c => c.status === 'replied').length
  const bounced = contacts.filter(c => c.status === 'bounced').length
  const unsubscribed = contacts.filter(c => c.status === 'unsubscribed').length

  return {
    sent,
    delivered,
    opened,
    clicked,
    replied,
    bounced,
    unsubscribed,
    openRate: sent > 0 ? (opened / sent) * 100 : 0,
    clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
    replyRate: sent > 0 ? (replied / sent) * 100 : 0
  }
}

/**
 * Pause or resume a sequence
 */
export async function toggleSequenceStatus(
  userId: string,
  sequenceId: string,
  isActive: boolean
): Promise<void> {
  const supabase = createClientComponentClient()
  
  // Verify sequence ownership
  const { data: sequence } = await supabase
    .from('sequences')
    .select('id')
    .eq('id', sequenceId)
    .eq('user_id', userId)
    .single()

  if (!sequence) {
    throw new Error('Sequence not found or access denied')
  }

  const { error } = await supabase
    .from('sequences')
    .update({ 
      is_active: isActive,
      updated_at: new Date().toISOString()
    })
    .eq('id', sequenceId)

  if (error) throw error
}

/**
 * Get deliverability best practices
 */
export function getDeliverabilityTips(): string[] {
  return [
    'Use a consistent sending schedule (avoid sending all emails at once)',
    'Maintain a clean email list (remove bounces and unsubscribes)',
    'Use a reputable sending domain with proper DNS records',
    'Keep your email content relevant and valuable',
    'Avoid spam trigger words and excessive punctuation',
    'Include a clear unsubscribe link in every email',
    'Monitor your sender reputation and bounce rates',
    'Warm up new domains gradually before sending at volume',
    'Use double opt-in for new subscribers',
    'Segment your audience for better engagement'
  ]
} 