// Block 257000 — AI Office Admin Engine v1
// POST /api/office-admin/documents/upload
// Uploads document, AI recognizes type, files it automatically

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const formData = await req.formData();
    
    const company_id = formData.get("company_id") as string;
    const file = formData.get("file") as File;
    const job_id = formData.get("job_id") as string | null;
    const lead_id = formData.get("lead_id") as string | null;
    const uploaded_by = formData.get("uploaded_by") as string | null;

    if (!company_id || !file) {
      return NextResponse.json(
        { error: "Missing required fields: company_id, file" },
        { status: 400 }
      );
    }

    // Step 1: Upload file to storage
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `office-documents/${company_id}/${fileName}`;

    const fileBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("office-documents")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError || !uploadData) {
      console.error("Error uploading file:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from("office-documents")
      .getPublicUrl(filePath);

    // Step 2: AI Document Recognition
    // Read file content for analysis (if text-based)
    let fileContent = "";
    let aiRecognizedType = "other";
    let aiExtractedData: Record<string, any> = {};
    let aiConfidence = 0;

    try {
      if (file.type.startsWith("text/") || file.type === "application/pdf") {
        // For PDFs, we'd need a PDF parser - for now, use filename and type
        const text = await file.text();
        fileContent = text.substring(0, 5000); // Limit to first 5000 chars
      }

      // AI Analysis
      const analysisPrompt = `You are SmartSend's AI Document Filing Assistant for a roofing company.

Analyze this document and determine:
1. Document type: one of ('contract', 'invoice', 'permit', 'inspection', 'warranty', 'supplement', 'coi', 'photo', 'estimate', 'other')
2. Confidence: 0-100 score
3. Extracted data: JSON object with relevant info (amounts, dates, job numbers, customer names, addresses, etc.)

File name: ${file.name}
File type: ${file.type}
Content preview: ${fileContent.substring(0, 2000)}

Return ONLY valid JSON:
{
  "doc_type": "",
  "confidence": 0,
  "extracted_data": {}
}`;

      const analysisCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful AI assistant that recognizes document types for roofing companies." },
          { role: "user", content: analysisPrompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const analysisText = analysisCompletion.choices[0]?.message?.content || "{}";
      const analysis = JSON.parse(analysisText);

      aiRecognizedType = analysis.doc_type || "other";
      aiExtractedData = analysis.extracted_data || {};
      aiConfidence = analysis.confidence || 0;
    } catch (analysisError: any) {
      console.error("Error analyzing document:", analysisError);
      // Continue with default values
    }

    // Step 3: Determine file path
    const year = new Date().getFullYear();
    let filedPath = `/${aiRecognizedType}s/${year}/${file.name}`;

    // If job_id is provided or extracted, include it in path
    let finalJobId = job_id;
    if (!finalJobId && aiExtractedData.job_number) {
      // Try to find job by extracted job number
      const { data: job } = await supabase
        .from("jobs")
        .select("id")
        .eq("company_id", company_id)
        .ilike("notes", `%${aiExtractedData.job_number}%`)
        .limit(1)
        .maybeSingle();

      if (job) {
        finalJobId = job.id;
      }
    }

    if (finalJobId) {
      filedPath = `/${aiRecognizedType}s/${year}/Job_${finalJobId}/${file.name}`;
    }

    // Step 4: Create document record
    const { data: document, error: docError } = await supabase
      .from("office_documents")
      .insert({
        company_id,
        job_id: finalJobId,
        lead_id: lead_id || null,
        doc_type: aiRecognizedType,
        file_name: file.name,
        file_url: publicUrl,
        file_size: file.size,
        mime_type: file.type,
        ai_recognized_type: aiRecognizedType,
        ai_extracted_data: aiExtractedData,
        ai_confidence: aiConfidence,
        filed_path: filedPath,
        uploaded_by: uploaded_by || null,
        uploaded_by_ai: !uploaded_by,
      })
      .select()
      .single();

    if (docError || !document) {
      console.error("Error creating document record:", docError);
      return NextResponse.json(
        { error: "Failed to create document record" },
        { status: 500 }
      );
    }

    // Step 5: Log activity
    await supabase.from("office_activity_log").insert({
      company_id,
      activity_type: "document_filed",
      document_id: document.id,
      job_id: finalJobId,
      lead_id: lead_id || null,
      performed_by: uploaded_by || null,
      performed_by_ai: !uploaded_by,
      details: {
        doc_type: aiRecognizedType,
        file_name: file.name,
        filed_path: filedPath,
        ai_confidence: aiConfidence,
      },
    });

    return NextResponse.json({
      success: true,
      document_id: document.id,
      doc_type: aiRecognizedType,
      filed_path: filedPath,
      extracted_data: aiExtractedData,
      confidence: aiConfidence,
    });
  } catch (error: any) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload document" },
      { status: 500 }
    );
  }
}





















