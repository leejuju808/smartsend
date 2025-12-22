// Block 468 — SmartLead Sync v1
// Edge Function: Multi-Source Lead Enrichment Engine
// Auto-refresh • Field Confidence Scoring • Always-Fresh Lead Data

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type SmartLeadSyncPayload = {
  lead_id?: string;
  workspace_id?: string;
  batch_size?: number;
  priority?: "normal" | "high" | "new" | "stale";
};

// Industry keywords mapping
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  "Construction": ["construction", "contractor", "roofing", "plumbing", "electrical", "hvac", "remodeling", "renovation", "building", "carpentry"],
  "Cleaning": ["cleaning", "janitorial", "maid", "sanitation", "custodial", "housekeeping"],
  "HVAC": ["hvac", "heating", "cooling", "air conditioning", "refrigeration", "ventilation"],
  "Plumbing": ["plumbing", "plumber", "pipe", "drain", "sewer", "water heater"],
  "Roofing": ["roofing", "roofer", "shingle", "gutter", "siding"],
  "Landscaping": ["landscaping", "lawn", "gardening", "irrigation", "sprinkler", "tree service"],
  "Legal": ["law", "attorney", "lawyer", "legal", "litigation", "law firm"],
  "Healthcare": ["health", "medical", "doctor", "clinic", "hospital", "dental", "pharmacy"],
  "Real Estate": ["real estate", "realtor", "property", "realty", "broker"],
  "Finance": ["finance", "financial", "accounting", "tax", "cpa", "bookkeeping"],
  "Technology": ["tech", "software", "it", "computer", "digital", "saas"],
  "Retail": ["retail", "store", "shop", "merchant", "commerce"],
  "Restaurant": ["restaurant", "cafe", "dining", "food service", "catering"],
  "Automotive": ["auto", "car", "automotive", "vehicle", "mechanic", "garage"],
  "Education": ["education", "school", "university", "learning", "training"],
};

// Tech stack keywords
const TECH_STACK_KEYWORDS: Record<string, string[]> = {
  "WordPress": ["wordpress", "wp-content", "wp-includes"],
  "Shopify": ["shopify", "myshopify.com"],
  "Wix": ["wix.com", "wixstatic"],
  "Squarespace": ["squarespace"],
  "WooCommerce": ["woocommerce", "wc-"],
  "Magento": ["magento"],
  "HubSpot": ["hubspot"],
  "Salesforce": ["salesforce", "force.com"],
  "Mailchimp": ["mailchimp"],
  "Stripe": ["stripe"],
  "Square": ["square"],
};

// Role inference from email patterns
function inferRoleFromEmail(email: string, domain: string): { role: string; seniority: string; confidence: number } {
  const emailLower = email.toLowerCase();
  const localPart = emailLower.split("@")[0];
  
  // Executive patterns
  if (localPart.includes("ceo") || localPart.includes("president") || localPart.includes("founder")) {
    return { role: "Executive", seniority: "Executive", confidence: 0.85 };
  }
  if (localPart.includes("owner") || localPart.includes("proprietor")) {
    return { role: "Owner", seniority: "Executive", confidence: 0.80 };
  }
  if (localPart.includes("director") || localPart.includes("vp") || localPart.includes("vice")) {
    return { role: "Director", seniority: "Senior", confidence: 0.75 };
  }
  if (localPart.includes("manager") || localPart.includes("mgr")) {
    return { role: "Manager", seniority: "Mid", confidence: 0.70 };
  }
  if (localPart.includes("sales") || localPart.includes("account")) {
    return { role: "Sales", seniority: "Mid", confidence: 0.65 };
  }
  
  // Generic patterns
  if (localPart === "info" || localPart === "contact" || localPart === "hello") {
    return { role: "General", seniority: "Unknown", confidence: 0.30 };
  }
  
  // First name pattern (common for owners/SMBs)
  if (localPart.split(".").length === 2 && localPart.split(".")[0].length < 10) {
    return { role: "Owner", seniority: "Executive", confidence: 0.60 };
  }
  
  return { role: "Unknown", seniority: "Unknown", confidence: 0.20 };
}

// Detect LinkedIn URL from various sources
function detectLinkedInUrl(lead: any): { linkedin_url: string; confidence: number } {
  // Already has LinkedIn URL
  if (lead.linkedin_url && lead.linkedin_url.includes("linkedin.com")) {
    return { linkedin_url: lead.linkedin_url, confidence: 0.95 };
  }
  
  // Try to construct from name and company
  if (lead.first_name && lead.last_name && lead.company) {
    const firstName = lead.first_name.toLowerCase().replace(/[^a-z]/g, "");
    const lastName = lead.last_name.toLowerCase().replace(/[^a-z]/g, "");
    const pattern = `linkedin.com/in/${firstName}${lastName}`;
    return { linkedin_url: `https://www.${pattern}`, confidence: 0.40 };
  }
  
  return { linkedin_url: "", confidence: 0 };
}

// Clean and validate phone number
function cleanPhoneNumber(phone: string | null): { phone: string; phone_valid: boolean } {
  if (!phone) {
    return { phone: "", phone_valid: false };
  }
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  
  // US/Canada format: 10 or 11 digits
  if (digits.length === 10) {
    const formatted = `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return { phone: formatted, phone_valid: true };
  }
  
  if (digits.length === 11 && digits.startsWith("1")) {
    const formatted = `+${digits.slice(0, 1)} ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    return { phone: formatted, phone_valid: true };
  }
  
  // International format (starts with +)
  if (phone.startsWith("+") && digits.length >= 10) {
    return { phone: phone.replace(/\s+/g, " ").trim(), phone_valid: true };
  }
  
  return { phone: phone, phone_valid: false };
}

// Infer industry from website content (lightweight)
async function inferIndustryFromWebsite(website: string | null, company: string | null): Promise<{ industry: string; confidence: number }> {
  if (!website) {
    // Try to infer from company name
    if (company) {
      const companyLower = company.toLowerCase();
      for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
        if (keywords.some(kw => companyLower.includes(kw))) {
          return { industry, confidence: 0.60 };
        }
      }
    }
    return { industry: "", confidence: 0 };
  }
  
  try {
    // Normalize website URL
    let url = website;
    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }
    
    // Fetch homepage (lightweight - just title and meta)
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SmartSend/1.0)",
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    if (!response.ok) {
      return { industry: "", confidence: 0 };
    }
    
    const html = await response.text();
    const htmlLower = html.toLowerCase();
    
    // Check title and meta description
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    
    const searchText = [
      titleMatch?.[1] || "",
      metaMatch?.[1] || "",
      htmlLower.substring(0, 5000), // First 5KB
    ].join(" ").toLowerCase();
    
    // Match against industry keywords
    let bestMatch = { industry: "", confidence: 0 };
    
    for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
      const matches = keywords.filter(kw => searchText.includes(kw)).length;
      const confidence = Math.min(0.95, 0.50 + (matches * 0.15));
      
      if (confidence > bestMatch.confidence) {
        bestMatch = { industry, confidence };
      }
    }
    
    return bestMatch;
  } catch (error) {
    console.error(`Error fetching website ${website}:`, error);
    // Fallback to company name inference
    if (company) {
      const companyLower = company.toLowerCase();
      for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
        if (keywords.some(kw => companyLower.includes(kw))) {
          return { industry, confidence: 0.50 };
        }
      }
    }
    return { industry: "", confidence: 0 };
  }
}

// Detect tech stack from website
async function detectTechStack(website: string | null): Promise<string[]> {
  if (!website) return [];
  
  try {
    let url = website;
    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SmartSend/1.0)",
      },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) return [];
    
    const html = await response.text().catch(() => "");
    const htmlLower = html.toLowerCase();
    
    const detected: string[] = [];
    
    for (const [tech, keywords] of Object.entries(TECH_STACK_KEYWORDS)) {
      if (keywords.some(kw => htmlLower.includes(kw))) {
        detected.push(tech);
      }
    }
    
    return detected;
  } catch (error) {
    return [];
  }
}

// Infer company size from various signals
function inferCompanySize(website: string | null, company: string | null, employeeCount?: number | null): { company_size: string; confidence: number } {
  if (employeeCount !== null && employeeCount !== undefined) {
    if (employeeCount < 10) return { company_size: "1-10", confidence: 0.95 };
    if (employeeCount < 50) return { company_size: "11-50", confidence: 0.95 };
    if (employeeCount < 200) return { company_size: "51-200", confidence: 0.95 };
    if (employeeCount < 1000) return { company_size: "201-1000", confidence: 0.95 };
    return { company_size: "1000+", confidence: 0.95 };
  }
  
  // Heuristics based on domain/company
  if (company) {
    const companyLower = company.toLowerCase();
    // SMB indicators
    if (companyLower.includes("llc") || companyLower.includes("inc") || companyLower.includes("corp")) {
      return { company_size: "11-50", confidence: 0.50 };
    }
  }
  
  return { company_size: "", confidence: 0 };
}

// Main enrichment function
async function enrichLead(lead: any): Promise<any> {
  const updates: Record<string, any> = {};
  const confidences: Record<string, number> = {};
  const source = "smartlead_sync_v1";
  
  // Extract domain from email or website
  const domain = lead.website 
    ? lead.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "")
    : lead.email?.split("@")[1] || "";
  
  // 1. Industry detection
  if (!lead.industry || lead.enrichment_status === "stale") {
    const industryResult = await inferIndustryFromWebsite(lead.website, lead.company);
    if (industryResult.industry) {
      updates.industry = industryResult.industry;
      confidences.industry = industryResult.confidence;
    }
  }
  
  // 2. Role/Title inference from email
  if (!lead.role && lead.email) {
    const roleResult = inferRoleFromEmail(lead.email, domain);
    if (roleResult.role !== "Unknown") {
      updates.role = roleResult.role;
      updates.seniority = roleResult.seniority;
      confidences.role = roleResult.confidence;
    }
  }
  
  // 3. LinkedIn URL detection
  if (!lead.linkedin_url) {
    const linkedinResult = detectLinkedInUrl(lead);
    if (linkedinResult.linkedin_url) {
      updates.linkedin_url = linkedinResult.linkedin_url;
      confidences.linkedin_url = linkedinResult.confidence;
    }
  }
  
  // 4. Phone number cleanup
  if (lead.phone) {
    const phoneResult = cleanPhoneNumber(lead.phone);
    updates.phone = phoneResult.phone;
    updates.phone_valid = phoneResult.phone_valid;
    confidences.phone_valid = phoneResult.phone_valid ? 0.90 : 0.10;
  }
  
  // 5. Company size inference
  if (!lead.company_size) {
    const sizeResult = inferCompanySize(lead.website, lead.company, lead.employee_count);
    if (sizeResult.company_size) {
      updates.company_size = sizeResult.company_size;
      confidences.company_size = sizeResult.confidence;
    }
  }
  
  // 6. Tech stack detection (only if website exists)
  if (lead.website && (!lead.technology_stack || lead.technology_stack.length === 0)) {
    const techStack = await detectTechStack(lead.website);
    if (techStack.length > 0) {
      updates.technology_stack = techStack;
      confidences.technology_stack = 0.70;
    }
  }
  
  // 7. Website normalization
  if (lead.website && !lead.website.startsWith("http")) {
    updates.website = `https://${lead.website}`;
    confidences.website = 0.95;
  }
  
  // 8. Email cleanup (normalize)
  if (lead.email) {
    const cleanedEmail = lead.email.toLowerCase().trim();
    if (cleanedEmail !== lead.email) {
      updates.email = cleanedEmail;
      confidences.email = 0.95;
    }
  }
  
  // Apply updates via database function
  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabase.rpc("apply_enrichment_updates", {
      p_lead_id: lead.lead_id,
      p_updates: {
        fields: updates,
        confidences: confidences,
        source: source,
      },
    });
    
    if (error) {
      console.error(`Error applying enrichment for lead ${lead.lead_id}:`, error);
      return { success: false, error: error.message };
    }
    
    return { success: true, updates, confidences };
  }
  
  return { success: true, updates: {}, confidences: {} };
}

Deno.serve(async (req) => {
  try {
    const payload: SmartLeadSyncPayload = await req.json().catch(() => ({}));
    
    // Batch mode: enrich multiple leads
    if (!payload.lead_id) {
      const batchSize = payload.batch_size || 50;
      const priority = payload.priority || "normal";
      
      // If workspace_id provided, process that workspace only
      // Otherwise, process leads from all workspaces
      let candidates: any[] = [];
      
      if (payload.workspace_id) {
        // Single workspace mode
        const { data: workspaceCandidates, error: candidatesError } = await supabase.rpc(
          "get_enrichment_candidates",
          {
            p_workspace_id: payload.workspace_id,
            p_limit: batchSize,
            p_priority: priority,
          }
        );
        
        if (candidatesError) {
          return new Response(
            JSON.stringify({ error: "Failed to get candidates", details: candidatesError.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        
        candidates = workspaceCandidates || [];
      } else {
        // Multi-workspace mode: get leads from all workspaces
        // Get first workspace with leads needing enrichment
        const { data: workspaceData } = await supabase
          .from("leads")
          .select("workspace_id")
          .not("workspace_id", "is", null)
          .is("last_enriched_at", null)
          .limit(1)
          .single();
        
        // If no leads with null enrichment, try stale leads
        let workspaceId = workspaceData?.workspace_id;
        if (!workspaceId) {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: staleWorkspaceData } = await supabase
            .from("leads")
            .select("workspace_id")
            .not("workspace_id", "is", null)
            .lt("last_enriched_at", sevenDaysAgo)
            .limit(1)
            .single();
          
          workspaceId = staleWorkspaceData?.workspace_id;
        }
        
        // Process first workspace found (to avoid timeout)
        if (workspaceId) {
          const { data: workspaceCandidates } = await supabase.rpc(
            "get_enrichment_candidates",
            {
              p_workspace_id: workspaceId,
              p_limit: batchSize,
              p_priority: priority,
            }
          );
          
          candidates = workspaceCandidates || [];
        }
      }
      
      if (candidates.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, processed: 0, message: "No leads to enrich" }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      
      let processed = 0;
      let errors = 0;
      
      for (const lead of candidates) {
        try {
          const result = await enrichLead(lead);
          if (result.success) {
            processed++;
          } else {
            errors++;
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error: any) {
          console.error(`Error enriching lead ${lead.lead_id}:`, error);
          errors++;
        }
      }
      
      return new Response(
        JSON.stringify({
          ok: true,
          processed,
          errors,
          total: candidates.length,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Single lead mode
    if (payload.lead_id) {
      // Get lead data
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", payload.lead_id)
        .single();
      
      if (leadError || !leadData) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      
      const result = await enrichLead({
        lead_id: leadData.id,
        workspace_id: leadData.workspace_id,
        ...leadData,
      });
      
      if (!result.success) {
        return new Response(
          JSON.stringify({ error: result.error || "Enrichment failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({
          ok: true,
          lead_id: payload.lead_id,
          updates: result.updates,
          confidences: result.confidences,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: "Missing lead_id or workspace_id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("SmartLead Sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

