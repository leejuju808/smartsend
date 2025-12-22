/**
 * Block 13400 — Contact Enrichment Service
 * 
 * Service functions to save and retrieve enrichment data
 */

import { createClient } from '@supabase/supabase-js';
import { enrichContact, EnrichmentContext, EnrichmentResult } from './contact-enrichment';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Save enrichment data to database
 */
export async function saveEnrichment(
  contactId: string,
  workspaceId: string,
  enrichment: EnrichmentResult
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Get or create enrichment record
  const { data: enrichmentId } = await supabase.rpc('get_or_create_enrichment', {
    p_contact_id: contactId,
    p_workspace_id: workspaceId
  });
  
  if (!enrichmentId) {
    throw new Error('Failed to create enrichment record');
  }
  
  // Update enrichment record
  const { error } = await supabase
    .from('contact_enrichment')
    .update({
      inferred_first_name: enrichment.inferred_first_name || null,
      inferred_last_name: enrichment.inferred_last_name || null,
      name_confidence: enrichment.name_confidence,
      inferred_city: enrichment.inferred_city || null,
      city_confidence: enrichment.city_confidence,
      inferred_zip: enrichment.inferred_zip || null,
      zip_confidence: enrichment.zip_confidence,
      inferred_state: enrichment.inferred_state || null,
      inferred_neighborhood: enrichment.inferred_neighborhood || null,
      neighborhood_confidence: enrichment.neighborhood_confidence,
      property_type: enrichment.property_type || null,
      property_type_confidence: enrichment.property_type_confidence,
      insurance_interest: enrichment.insurance_interest,
      storm_risk_level: enrichment.storm_risk_level || null,
      enrichment_sources: enrichment.enrichment_sources,
      last_enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', enrichmentId);
  
  if (error) {
    throw new Error(`Failed to save enrichment: ${error.message}`);
  }
  
  // Apply enrichment to contacts table (only high-confidence fields)
  await supabase.rpc('apply_contact_enrichment', {
    p_contact_id: contactId
  });
}

/**
 * Enrich a contact and save the results
 */
export async function enrichAndSave(
  contactId: string,
  context: EnrichmentContext,
  supabase: any
): Promise<void> {
  const enrichment = await enrichContact(contactId, context, supabase);
  await saveEnrichment(contactId, context.workspaceId, enrichment);
}

/**
 * Batch enrich contacts (for daily cron job)
 */
export async function batchEnrichContacts(
  workspaceId: string,
  limit: number = 100
): Promise<number> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Find contacts missing enrichment or with low confidence
  const { data: contacts } = await supabase
    .from('contacts')
    .select(`
      id,
      email,
      first_name,
      last_name,
      city,
      postal_code,
      state,
      tags,
      workspace_id
    `)
    .eq('workspace_id', workspaceId)
    .limit(limit);
  
  if (!contacts || contacts.length === 0) {
    return 0;
  }
  
  // Get workspace service area for context
  const { data: workspaceProfile } = await supabase
    .from('workspace_profile')
    .select('service_areas')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  
  const serviceArea = workspaceProfile?.service_areas || [];
  
  let enriched = 0;
  
  for (const contact of contacts) {
    try {
      const context: EnrichmentContext = {
        email: contact.email,
        existingFirstName: contact.first_name || undefined,
        existingLastName: contact.last_name || undefined,
        existingCity: contact.city || undefined,
        existingZip: contact.postal_code || undefined,
        existingState: contact.state || undefined,
        existingTags: contact.tags || [],
        workspaceId: contact.workspace_id,
        serviceArea: serviceArea
      };
      
      await enrichAndSave(contact.id, context, supabase);
      enriched++;
    } catch (error) {
      console.error(`Failed to enrich contact ${contact.id}:`, error);
    }
  }
  
  return enriched;
}

/**
 * Enrich contact from reply content
 */
export async function enrichFromReply(
  contactId: string,
  workspaceId: string,
  replyContent: string,
  supabase: any
): Promise<void> {
  // Get contact data
  const { data: contact } = await supabase
    .from('contacts')
    .select('email, first_name, last_name, city, postal_code, state, tags')
    .eq('id', contactId)
    .single();
  
  if (!contact) {
    return;
  }
  
  // Get workspace service area
  const { data: workspaceProfile } = await supabase
    .from('workspace_profile')
    .select('service_areas')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  
  const serviceArea = workspaceProfile?.service_areas || [];
  
  const context: EnrichmentContext = {
    email: contact.email,
    existingFirstName: contact.first_name || undefined,
    existingLastName: contact.last_name || undefined,
    existingCity: contact.city || undefined,
    existingZip: contact.postal_code || undefined,
    existingState: contact.state || undefined,
    existingTags: contact.tags || [],
    replyContent: replyContent,
    workspaceId: workspaceId,
    serviceArea: serviceArea
  };
  
  await enrichAndSave(contactId, context, supabase);
}





















































