import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Process call intelligence asynchronously
 * Generates summary, extracts intents, detects outcome, creates tasks, moves pipeline
 */
export async function processCallIntelligence(callId: string) {
  try {
    const supabase = createClient()

    // Get call transcript
    const { data: call, error: callError } = await supabase
      .from('call_transcripts')
      .select('*')
      .eq('id', callId)
      .single()

    if (callError || !call) {
      throw new Error('Call transcript not found')
    }

    // Step 1: Generate AI Call Summary
    const summaryResult = await generateCallSummary(call.transcription)
    
    // Step 2: Extract Intents
    const intentResult = await extractCallIntents(call.transcription)
    
    // Step 3: Detect Call Outcome
    const outcomeResult = await detectCallOutcome(call.transcription, summaryResult, intentResult)
    
    // Step 4: Update call transcript with AI results
    const { error: updateError } = await supabase
      .from('call_transcripts')
      .update({
        call_summary: summaryResult.summary,
        homeowner_concern: summaryResult.homeowner_concern,
        job_type: summaryResult.job_type,
        severity: summaryResult.severity,
        urgency: summaryResult.urgency,
        insurance_involvement: summaryResult.insurance_involvement,
        insurance_claim_number: summaryResult.insurance_claim_number,
        insurance_company: summaryResult.insurance_company,
        next_steps: summaryResult.next_steps,
        key_questions: summaryResult.key_questions,
        objections: summaryResult.objections,
        timeline_mentioned: summaryResult.timeline_mentioned,
        intents: intentResult.intents,
        extracted_info: intentResult.extracted_info,
        call_outcome: outcomeResult.outcome,
        outcome_confidence: outcomeResult.confidence,
        ai_summary_status: 'completed',
        ai_intent_status: 'completed',
        ai_outcome_status: 'completed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', callId)

    if (updateError) {
      throw new Error(`Failed to update call transcript: ${updateError.message}`)
    }

    // Step 5: Evaluate Revenue Intelligence
    await supabase.rpc('evaluate_call_revenue', { p_call_id: callId })

    // Step 6: Generate Coaching Tips
    await supabase.rpc('generate_call_coaching', { p_call_id: callId })

    // Step 7: Auto-Create Tasks
    await supabase.rpc('create_tasks_from_call', { p_call_id: callId })

    // Step 8: Auto-Move Pipeline
    await supabase.rpc('auto_move_pipeline_from_call', { p_call_id: callId })

    console.log(`Call intelligence processing completed for call ${callId}`)
  } catch (error) {
    console.error('Error processing call intelligence:', error)
    
    // Update status to failed
    const supabase = createClient()
    await supabase
      .from('call_transcripts')
      .update({
        ai_summary_status: 'failed',
        ai_intent_status: 'failed',
        ai_outcome_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', callId)
  }
}

/**
 * Generate AI call summary (roofing-tuned)
 */
async function generateCallSummary(transcription: string): Promise<any> {
  const prompt = `You are an AI assistant specialized in analyzing roofing contractor phone calls. Analyze the following call transcription and extract key information.

Call Transcription:
${transcription}

Provide a JSON response with the following structure:
{
  "summary": "Brief 2-3 sentence summary of the call",
  "homeowner_concern": "Primary concern or issue mentioned",
  "job_type": "repair|replacement|inspection|general_question|not_roofing",
  "severity": "low|medium|high|critical",
  "urgency": "low|medium|high|critical",
  "insurance_involvement": true/false,
  "insurance_claim_number": "claim number if mentioned, else null",
  "insurance_company": "insurance company name if mentioned, else null",
  "next_steps": ["array of next steps identified"],
  "key_questions": ["array of key questions asked"],
  "objections": ["array of objections raised"],
  "timeline_mentioned": "timeline mentioned if any, else null"
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a roofing industry expert AI that analyzes phone calls between contractors and homeowners.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}')
    return result
  } catch (error) {
    console.error('Error generating call summary:', error)
    return {
      summary: 'Unable to generate summary',
      homeowner_concern: null,
      job_type: null,
      severity: null,
      urgency: null,
      insurance_involvement: false,
      insurance_claim_number: null,
      insurance_company: null,
      next_steps: [],
      key_questions: [],
      objections: [],
      timeline_mentioned: null,
    }
  }
}

/**
 * Extract call intents and information
 */
async function extractCallIntents(transcription: string): Promise<any> {
  const prompt = `Extract structured intents and information from this roofing contractor call transcription.

Call Transcription:
${transcription}

Provide a JSON response with:
{
  "intents": {
    "appointment_request": true/false,
    "price_request": true/false,
    "insurance_question": true/false,
    "scheduling_need": true/false,
    "availability": true/false,
    "claim_status": true/false,
    "other": "any other intent"
  },
  "extracted_info": {
    "address": "address if mentioned",
    "email": "email if mentioned",
    "preferred_time": "preferred time if mentioned",
    "availability": "availability mentioned",
    "claim_status": "claim status if mentioned",
    "deductible_amount": "deductible if mentioned"
  }
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Extract structured intents and information from roofing contractor calls.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    })

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}')
    return {
      intents: result.intents || {},
      extracted_info: result.extracted_info || {},
    }
  } catch (error) {
    console.error('Error extracting intents:', error)
    return {
      intents: {},
      extracted_info: {},
    }
  }
}

/**
 * Detect call outcome
 */
async function detectCallOutcome(
  transcription: string,
  summary: any,
  intents: any
): Promise<any> {
  const prompt = `Detect the call outcome from this roofing contractor call. Look for signals like:
- Agreed appointment → "appointment_scheduled"
- Requested appointment → "appointment_requested"
- Asked for pricing → "estimate_requested" or "pricing_discussed"
- Mentioned insurance → "insurance_mentioned"
- Confirmed storm damage → "storm_damage_confirmed"
- Showed interest → "interested"
- Hesitation → "hesitation"
- "Let me think about it" → "thinking_about_it"
- "Not today" → "not_interested"
- "Call later" → "call_back_later"
- "My deductible is..." → "deductible_discussed"
- "Getting other quotes" → "getting_other_quotes"
- "Send info to my email" → "send_info_email"

Call Transcription:
${transcription}

Summary: ${JSON.stringify(summary)}
Intents: ${JSON.stringify(intents)}

Provide JSON:
{
  "outcome": "one of the outcomes above",
  "confidence": 0-100
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Detect call outcomes from roofing contractor conversations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    })

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}')
    return {
      outcome: result.outcome || 'other',
      confidence: result.confidence || 50,
    }
  } catch (error) {
    console.error('Error detecting call outcome:', error)
    return {
      outcome: 'other',
      confidence: 0,
    }
  }
}



















































