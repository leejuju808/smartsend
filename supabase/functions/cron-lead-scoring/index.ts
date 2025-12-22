import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the recompute function
    const { error } = await supabase.rpc('recompute_lead_scores')
    
    if (error) {
      throw error
    }

    // Get some stats for logging
    const { data: stats } = await supabase
      .from('contacts')
      .select('lead_score')
      .not('lead_score', 'is', null)

    const totalContacts = stats?.length || 0
    const avgScore = totalContacts > 0 
      ? Math.round(stats.reduce((sum, c) => sum + (c.lead_score || 0), 0) / totalContacts)
      : 0
    const hotLeads = stats?.filter(c => (c.lead_score || 0) >= 50).length || 0

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Lead scores recomputed successfully',
        stats: {
          totalContacts,
          averageScore: avgScore,
          hotLeads,
          timestamp: new Date().toISOString()
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
}) 