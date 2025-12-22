// Block 22830 — SmartSend Roofing Document Delivery & E-Sign v1
// Edge Function: /documents/sign
// 
// This function handles:
// - Capturing signature (text or drawn)
// - Generating signed PDF
// - Updating DB
// - Timeline update

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { PDFDocument, StandardFonts, rgb } from "https://cdn.skypack.dev/pdf-lib@1.17.1";

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
    const {
      document_id,
      signature_text,
      signature_image, // base64 encoded image (optional, for drawn signatures)
      signer_name,
      signer_ip,
    } = await req.json();

    if (!document_id || (!signature_text && !signature_image)) {
      return new Response(
        JSON.stringify({ error: "Missing fields: document_id and signature_text or signature_image required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1️⃣ Load document record
    const { data: doc, error: docError } = await supabase
      .from("job_signable_documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docError || !doc) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2️⃣ Fetch original PDF from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from("documents-original")
      .download(doc.storage_path);

    if (fileError || !fileData) {
      return new Response(
        JSON.stringify({ error: "Original PDF not found in storage" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const originalBytes = await fileData.arrayBuffer();

    // 3️⃣ Load PDF and add signature
    const pdfDoc = await PDFDocument.load(originalBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Place signature on bottom-left area
    const signatureY = 50;
    const signatureX = 50;

    // Add signature text
    if (signature_text) {
      firstPage.drawText(`Signed By: ${signature_text}`, {
        x: signatureX,
        y: signatureY,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
    }

    // Add signature image if provided (drawn signature)
    if (signature_image) {
      try {
        // Decode base64 image
        const imageBytes = Uint8Array.from(
          atob(signature_image.split(",")[1] || signature_image),
          (c) => c.charCodeAt(0)
        );
        
        // Embed image (assuming PNG format)
        const signatureImg = await pdfDoc.embedPng(imageBytes);
        const imgDims = signatureImg.scale(0.3); // Scale down signature
        
        firstPage.drawImage(signatureImg, {
          x: signatureX,
          y: signatureY - 30,
          width: imgDims.width,
          height: imgDims.height,
        });
      } catch (imgError) {
        console.warn("Could not embed signature image:", imgError);
        // Fall back to text signature
        if (signer_name) {
          firstPage.drawText(`Signed By: ${signer_name}`, {
            x: signatureX,
            y: signatureY - 20,
            size: 12,
            font,
            color: rgb(0, 0, 0),
          });
        }
      }
    }

    // Add metadata text
    const metadataY = signatureY - (signature_image ? 60 : 20);
    const metadataText = [
      `IP: ${signer_ip || "Unknown"} | Name: ${signer_name || signature_text || "Unknown"}`,
      `Signed At: ${new Date().toISOString()}`,
    ].join("\n");

    firstPage.drawText(metadataText, {
      x: signatureX,
      y: metadataY,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // 4️⃣ Save signed PDF
    const signedBytes = await pdfDoc.save();
    const signedPath = `${doc.workspace_id}/${doc.job_id}/${doc.id}-signed.pdf`;

    // Upload signed PDF to storage
    const { error: uploadError } = await supabase.storage
      .from("documents-signed")
      .upload(signedPath, signedBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Error uploading signed PDF:", uploadError);
      throw uploadError;
    }

    // 5️⃣ Update document record
    const { error: updateError } = await supabase
      .from("job_signable_documents")
      .update({
        status: "signed",
        signed_storage_path: signedPath,
        signed_at: new Date().toISOString(),
        signer_ip: signer_ip || null,
        signer_name: signer_name || signature_text || null,
      })
      .eq("id", document_id);

    if (updateError) {
      console.error("Error updating document:", updateError);
      throw updateError;
    }

    // 6️⃣ Insert timeline event
    try {
      await supabase.from("job_timeline").insert({
        job_id: doc.job_id,
        event_type: "document_signed",
        description: `${doc.document_type} signed by homeowner`,
        metadata: {
          document_id: doc.id,
          document_type: doc.document_type,
          signer_name: signer_name || signature_text,
        },
      });
    } catch (timelineError) {
      // Timeline insert is optional
      console.warn("Could not insert timeline event:", timelineError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        signed_path: signedPath,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Error in documents-sign:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});







































