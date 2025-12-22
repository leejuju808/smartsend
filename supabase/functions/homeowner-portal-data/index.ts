// Block 22790 — SmartSend Roofing Homeowner Portal v1
// Edge Function: /homeowner/portal-data
// 
// This function returns homeowner-safe data for the portal:
// - Job info (name, address, status, progress)
// - Field photos (scrubbed of internal tags)
// - Simplified field notes (homeowner-safe only)
// - Next scheduled steps

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { portal_token } = await req.json();

    if (!portal_token) {
      return new Response(
        JSON.stringify({ error: "portal_token required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1️⃣ Find portal entry
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("job_id, workspace_id, is_enabled")
      .eq("portal_token", portal_token)
      .single();

    if (portalError || !portal || !portal.is_enabled) {
      return new Response(
        JSON.stringify({ error: "invalid link" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { job_id, workspace_id } = portal;
    
    // Get org_id from job
    const { data: jobData } = await supabase
      .from("roofing_jobs")
      .select("org_id")
      .eq("id", job_id)
      .single();
    
    const org_id = jobData?.org_id;

    // 2️⃣ Load job info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, title, homeowner_name, address, progress_percent, status, crew_name")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "job not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3️⃣ Load field photos (scrub internal tags - only show before/during/after)
    const { data: photos, error: photosError } = await supabase
      .from("job_field_photos")
      .select("id, storage_path, caption, tag, created_at")
      .eq("job_id", job_id)
      .in("tag", ["before", "during", "after"]) // Only homeowner-safe tags
      .order("created_at", { ascending: false })
      .limit(50);

    if (photosError) {
      console.error("Error fetching photos:", photosError);
    }

    // Get public URLs for photos
    const photosWithUrls = (photos || []).map((photo: any) => {
      const { data: urlData } = supabase.storage
        .from("field-photos")
        .getPublicUrl(photo.storage_path);

      return {
        id: photo.id,
        url: urlData.publicUrl,
        caption: photo.caption,
        tag: photo.tag,
        created_at: photo.created_at,
      };
    });

    // 4️⃣ Load simplified field notes (remove internal notes)
    // Only show progress and general notes, filter out internal issues/safety notes
    const { data: notes, error: notesError } = await supabase
      .from("job_field_notes")
      .select("id, content, note_type, created_at")
      .eq("job_id", job_id)
      .in("note_type", ["progress", "general"]) // Only homeowner-safe note types
      .order("created_at", { ascending: false })
      .limit(20);

    if (notesError) {
      console.error("Error fetching notes:", notesError);
    }

    // 5️⃣ Production schedule info (what's next)
    const { data: slots, error: slotsError } = await supabase
      .from("job_production_slots")
      .select("id, start_date, end_date, status, crew:crews(name)")
      .eq("job_id", job_id)
      .order("start_date", { ascending: true });

    if (slotsError) {
      console.error("Error fetching production slots:", slotsError);
    }

    // Prepare "next steps"
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcoming = (slots || []).find((s: any) => {
      const startDate = new Date(s.start_date);
      startDate.setHours(0, 0, 0, 0);
      return startDate >= today && s.status !== "canceled";
    });

    const nextStep = upcoming ? {
      start_date: upcoming.start_date,
      end_date: upcoming.end_date,
      crew_name: upcoming.crew?.name || null,
      status: upcoming.status,
    } : null;

    // 6️⃣ Load invoices (Block 22880: Payments & Collections)
    const invoices = org_id ? (await supabase
      .from("job_invoices")
      .select("id, type, amount, due_date, status, payment_link, created_at")
      .eq("job_id", job_id)
      .eq("org_id", org_id)
      .order("created_at", { ascending: false })).data || [] : [];

    // Calculate payment status
    const payments = org_id ? (await supabase
      .from("job_payments")
      .select("id, amount, method, created_at, invoice_id")
      .eq("job_id", job_id)
      .eq("org_id", org_id)
      .order("created_at", { ascending: false })).data || [] : [];

    // 7️⃣ Load trust-building features (Block 25140)
    const { data: trustFeatures } = await supabase
      .from("homeowner_trust_features")
      .select("project_manager_name, project_manager_photo_url, crew_contact_name, crew_contact_phone, cleanup_verified, cleanup_issues_reported, warranty_delivered_at, warranty_document_url, final_photo_urls, review_links_provided")
      .eq("job_id", job_id)
      .maybeSingle();

    // 8️⃣ Load portal timeline events (Block 25140)
    const { data: timelineEvents } = await supabase
      .from("homeowner_portal_timeline_events")
      .select("id, event_type, event_title, event_description, event_date, icon_name, color")
      .eq("job_id", job_id)
      .order("event_date", { ascending: false })
      .limit(20);

    // 9️⃣ Load messages (Block 25140: Homeowner Experience)
    // Get contact_id from job
    const { data: jobForContact } = await supabase
      .from("roofing_jobs")
      .select("contact_id, lead_id")
      .eq("id", job_id)
      .single();

    let messages: any[] = [];
    if (jobForContact?.contact_id) {
      // Get messages from unified_messages table
      const { data: jobMessages } = await supabase
        .from("unified_messages")
        .select("id, subject, body_text, direction, created_at, from_address")
        .or(`contact_id.eq.${jobForContact.contact_id},lead_id.eq.${jobForContact.lead_id || '00000000-0000-0000-0000-000000000000'}`)
        .eq("workspace_id", workspace_id)
        .in("channel", ["email", "sms"])
        .order("created_at", { ascending: false })
        .limit(50);

      messages = jobMessages || [];
    }

    // 🔟 Load documents (Block 25540: Warranty & Document Vault v1)
    // Get documents from job_documents table
    let documents: any[] = [];
    
    const { data: jobDocuments } = await supabase
      .from("job_documents")
      .select("id, title, doc_type, category_folder, file_url, uploaded_at, metadata")
      .eq("job_id", job_id)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false });

    if (jobDocuments) {
      documents = await Promise.all(
        jobDocuments.map(async (doc: any) => {
          // Get signed URL if file_url exists
          let url = null;
          if (doc.file_url) {
            const { data: urlData } = await supabase.storage
              .from("job-documents")
              .createSignedUrl(doc.file_url, 3600); // 1 hour expiry
            url = urlData?.signedUrl || null;
          }

          return {
            id: doc.id,
            name: doc.title || doc.doc_type || "Document",
            type: doc.doc_type || "document",
            category: doc.category_folder || "other",
            url: url,
            created_at: doc.uploaded_at,
            metadata: doc.metadata || {},
          };
        })
      );
    }

    // 🔟.1 Load warranty package (Block 25540)
    let warrantyPackage: any = null;
    const { data: warrantyData } = await supabase
      .from("warranty_packages")
      .select(`
        *,
        manufacturer_warranty:job_documents!warranty_packages_manufacturer_warranty_document_id_fkey(
          id,
          title,
          file_url
        ),
        workmanship_warranty:job_documents!warranty_packages_workmanship_warranty_document_id_fkey(
          id,
          title,
          file_url
        ),
        material_list:job_documents!warranty_packages_material_list_document_id_fkey(
          id,
          title,
          file_url
        )
      `)
      .eq("job_id", job_id)
      .single();

    if (warrantyData) {
      // Get signed URLs for warranty documents
      const warrantyDocs: any[] = [];
      
      if (warrantyData.manufacturer_warranty?.file_url) {
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(warrantyData.manufacturer_warranty.file_url, 3600);
        warrantyDocs.push({
          type: "manufacturer_warranty",
          name: warrantyData.manufacturer_warranty.title || "Manufacturer Warranty",
          url: urlData?.signedUrl || null,
        });
      }

      if (warrantyData.workmanship_warranty?.file_url) {
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(warrantyData.workmanship_warranty.file_url, 3600);
        warrantyDocs.push({
          type: "workmanship_warranty",
          name: warrantyData.workmanship_warranty.title || "Workmanship Warranty",
          url: urlData?.signedUrl || null,
        });
      }

      if (warrantyData.material_list?.file_url) {
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(warrantyData.material_list.file_url, 3600);
        warrantyDocs.push({
          type: "material_list",
          name: warrantyData.material_list.title || "Material List",
          url: urlData?.signedUrl || null,
        });
      }

      // Get before/after photos
      let beforePhotos: any[] = [];
      let afterPhotos: any[] = [];

      if (warrantyData.before_photos_document_ids?.length > 0) {
        const { data: beforePhotosData } = await supabase
          .from("job_documents")
          .select("id, title, file_url")
          .in("id", warrantyData.before_photos_document_ids)
          .is("deleted_at", null);

        beforePhotos = await Promise.all(
          (beforePhotosData || []).map(async (photo: any) => {
            const { data: urlData } = await supabase.storage
              .from("job-documents")
              .createSignedUrl(photo.file_url, 3600);
            return {
              id: photo.id,
              name: photo.title || "Before Photo",
              url: urlData?.signedUrl || null,
            };
          })
        );
      }

      if (warrantyData.after_photos_document_ids?.length > 0) {
        const { data: afterPhotosData } = await supabase
          .from("job_documents")
          .select("id, title, file_url")
          .in("id", warrantyData.after_photos_document_ids)
          .is("deleted_at", null);

        afterPhotos = await Promise.all(
          (afterPhotosData || []).map(async (photo: any) => {
            const { data: urlData } = await supabase.storage
              .from("job-documents")
              .createSignedUrl(photo.file_url, 3600);
            return {
              id: photo.id,
              name: photo.title || "After Photo",
              url: urlData?.signedUrl || null,
            };
          })
        );
      }

      warrantyPackage = {
        id: warrantyData.id,
        status: warrantyData.status,
        install_date: warrantyData.install_date,
        smart_send_job_id: warrantyData.smart_send_job_id,
        homeowner_portal_link: warrantyData.homeowner_portal_link,
        shingle_brand: warrantyData.shingle_brand,
        shingle_color: warrantyData.shingle_color,
        crew_info: warrantyData.crew_info || {},
        ventilation_details: warrantyData.ventilation_details,
        underlayment_details: warrantyData.underlayment_details,
        documents: warrantyDocs,
        before_photos: beforePhotos,
        after_photos: afterPhotos,
        generated_at: warrantyData.generated_at,
        delivered_at: warrantyData.delivered_at,
      };
    }

    // 9️⃣ Update portal view count
    await supabase
      .from("homeowner_portals")
      .update({
        portal_view_count: (portal.portal_view_count || 0) + 1,
        last_viewed_at: new Date().toISOString(),
        portal_viewed_at: portal.portal_viewed_at || new Date().toISOString(),
      })
      .eq("portal_token", portal_token);

    // 🔟.2 Load warranty package (Block 25540)
    let warrantyPackage: any = null;
    const { data: warrantyData } = await supabase
      .from("warranty_packages")
      .select(`
        *,
        manufacturer_warranty:job_documents!warranty_packages_manufacturer_warranty_document_id_fkey(
          id,
          title,
          file_url
        ),
        workmanship_warranty:job_documents!warranty_packages_workmanship_warranty_document_id_fkey(
          id,
          title,
          file_url
        ),
        material_list:job_documents!warranty_packages_material_list_document_id_fkey(
          id,
          title,
          file_url
        )
      `)
      .eq("job_id", job_id)
      .single();

    if (warrantyData) {
      // Get signed URLs for warranty documents
      const warrantyDocs: any[] = [];
      
      if (warrantyData.manufacturer_warranty?.file_url) {
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(warrantyData.manufacturer_warranty.file_url, 3600);
        warrantyDocs.push({
          type: "manufacturer_warranty",
          name: warrantyData.manufacturer_warranty.title || "Manufacturer Warranty",
          url: urlData?.signedUrl || null,
        });
      }

      if (warrantyData.workmanship_warranty?.file_url) {
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(warrantyData.workmanship_warranty.file_url, 3600);
        warrantyDocs.push({
          type: "workmanship_warranty",
          name: warrantyData.workmanship_warranty.title || "Workmanship Warranty",
          url: urlData?.signedUrl || null,
        });
      }

      if (warrantyData.material_list?.file_url) {
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(warrantyData.material_list.file_url, 3600);
        warrantyDocs.push({
          type: "material_list",
          name: warrantyData.material_list.title || "Material List",
          url: urlData?.signedUrl || null,
        });
      }

      // Get before/after photos
      let beforePhotos: any[] = [];
      let afterPhotos: any[] = [];

      if (warrantyData.before_photos_document_ids?.length > 0) {
        const { data: beforePhotosData } = await supabase
          .from("job_documents")
          .select("id, title, file_url")
          .in("id", warrantyData.before_photos_document_ids)
          .is("deleted_at", null);

        beforePhotos = await Promise.all(
          (beforePhotosData || []).map(async (photo: any) => {
            const { data: urlData } = await supabase.storage
              .from("job-documents")
              .createSignedUrl(photo.file_url, 3600);
            return {
              id: photo.id,
              name: photo.title || "Before Photo",
              url: urlData?.signedUrl || null,
            };
          })
        );
      }

      if (warrantyData.after_photos_document_ids?.length > 0) {
        const { data: afterPhotosData } = await supabase
          .from("job_documents")
          .select("id, title, file_url")
          .in("id", warrantyData.after_photos_document_ids)
          .is("deleted_at", null);

        afterPhotos = await Promise.all(
          (afterPhotosData || []).map(async (photo: any) => {
            const { data: urlData } = await supabase.storage
              .from("job-documents")
              .createSignedUrl(photo.file_url, 3600);
            return {
              id: photo.id,
              name: photo.title || "After Photo",
              url: urlData?.signedUrl || null,
            };
          })
        );
      }

      warrantyPackage = {
        id: warrantyData.id,
        status: warrantyData.status,
        install_date: warrantyData.install_date,
        smart_send_job_id: warrantyData.smart_send_job_id,
        homeowner_portal_link: warrantyData.homeowner_portal_link,
        shingle_brand: warrantyData.shingle_brand,
        shingle_color: warrantyData.shingle_color,
        crew_info: warrantyData.crew_info || {},
        ventilation_details: warrantyData.ventilation_details,
        underlayment_details: warrantyData.underlayment_details,
        documents: warrantyDocs,
        before_photos: beforePhotos,
        after_photos: afterPhotos,
        generated_at: warrantyData.generated_at,
        delivered_at: warrantyData.delivered_at,
      };
    }

    return new Response(
      JSON.stringify({
        job: {
          id: job.id,
          name: job.title || `${job.homeowner_name || "Job"} - Roof Replacement`,
          address: job.address,
          status: job.status,
          progress_percent: job.progress_percent || 0,
          crew_name: job.crew_name,
        },
        photos: photosWithUrls,
        notes: notes || [],
        next_step: nextStep,
        invoices: invoices || [],
        payments: payments || [],
        trust_features: trustFeatures || null,
        timeline_events: timelineEvents || [],
        messages: messages || [],
        documents: documents || [],
        warranty_package: warrantyPackage,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Error in homeowner-portal-data:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

