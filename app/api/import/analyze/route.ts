/**
 * Block 260: Bulk Importer v3 - CSV Analysis Endpoint
 * Analyzes CSV file and returns auto-detected mapping, quality score, and template suggestions
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parse } from "csv-parse/sync";
import { autoDetectMapping } from "@/lib/import/autoDetect";
import { calculateQualityScore, isValidEmail, isValidDomain } from "@/lib/import/qualityScore";
import { findBestTemplate, normalizeHeaderSignature } from "@/lib/import/templateMatching";
import { suggestRepair } from "@/lib/import/errorRepair";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const workspaceId = form.get("workspaceId") as string | null;

    if (!file || !workspaceId) {
      return NextResponse.json(
        { error: "Missing file or workspaceId" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse CSV
    const buf = Buffer.from(await file.arrayBuffer());
    const text = buf.toString("utf8");

    const records: any[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });

    if (records.length === 0) {
      return NextResponse.json(
        { error: "CSV file is empty or has no valid rows" },
        { status: 400 }
      );
    }

    const headers = Object.keys(records[0]);
    const sampleRows = records.slice(0, Math.min(10, records.length));

    // Auto-detect mapping
    const autoMapping = autoDetectMapping(headers, sampleRows);

    // Check for template matches
    const templateMatch = findBestTemplate(headers);
    
    // Check workspace templates
    const { data: workspaceTemplates } = await supabase
      .from("import_mapping_templates")
      .select("*")
      .eq("workspace_id", workspaceId);

    let matchedTemplate: any = null;
    if (workspaceTemplates && workspaceTemplates.length > 0) {
      const normalizedHeaders = normalizeHeaderSignature(headers);
      for (const template of workspaceTemplates) {
        const signature = template.header_signature as string[];
        const normalizedSig = normalizeHeaderSignature(signature);
        const similarity = jaccardSimilarity(normalizedHeaders, normalizedSig);
        if (similarity >= 0.7 && (!matchedTemplate || similarity > matchedTemplate.similarity)) {
          matchedTemplate = { ...template, similarity };
        }
      }
    }

    // Calculate quality metrics
    const existingEmails = new Set<string>();
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("email")
      .eq("workspace_id", workspaceId);
    
    if (existingContacts) {
      existingContacts.forEach((c: any) => {
        if (c.email) existingEmails.add(c.email.toLowerCase());
      });
    }

    const metrics = {
      totalRows: records.length,
      validEmailRows: 0,
      missingEmailRows: 0,
      invalidEmailRows: 0,
      duplicateInFileRows: 0,
      duplicateInDbRows: 0,
      invalidDomainRows: 0,
      rowsWithCompany: 0,
    };

    const seenEmails = new Set<string>();
    const errors: Array<{
      row: number;
      field: string;
      value: any;
      error: string;
      suggestion?: any;
    }> = [];

    // Find email column (use auto-detected or first column that looks like email)
    let emailColumn: string | null = null;
    for (const [header, type] of Object.entries(autoMapping)) {
      if (type === "email") {
        emailColumn = header;
        break;
      }
    }
    if (!emailColumn) {
      // Try to find email-like column
      for (const header of headers) {
        if (header.toLowerCase().includes("email")) {
          emailColumn = header;
          break;
        }
      }
    }

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const email = emailColumn ? row[emailColumn] : null;

      // Email validation
      if (!email || !email.toString().trim()) {
        metrics.missingEmailRows++;
        errors.push({
          row: i + 1,
          field: emailColumn || "email",
          value: email,
          error: "Missing email",
        });
      } else if (!isValidEmail(email)) {
        metrics.invalidEmailRows++;
        const suggestion = suggestRepair("email", email, "Invalid email format");
        errors.push({
          row: i + 1,
          field: emailColumn || "email",
          value: email,
          error: "Invalid email format",
          suggestion,
        });
      } else {
        metrics.validEmailRows++;
        const normalizedEmail = email.toString().trim().toLowerCase();
        if (seenEmails.has(normalizedEmail)) {
          metrics.duplicateInFileRows++;
        } else {
          seenEmails.add(normalizedEmail);
          if (existingEmails.has(normalizedEmail)) {
            metrics.duplicateInDbRows++;
          }
        }
      }

      // Company check
      const companyColumn = Object.entries(autoMapping).find(([_, type]) => type === "company")?.[0];
      if (companyColumn && row[companyColumn]) {
        metrics.rowsWithCompany++;
      }

      // Domain validation (if website column exists)
      const websiteColumn = Object.entries(autoMapping).find(([_, type]) => type === "website")?.[0];
      if (websiteColumn && row[websiteColumn]) {
        if (!isValidDomain(row[websiteColumn])) {
          metrics.invalidDomainRows++;
          const suggestion = suggestRepair("website", row[websiteColumn], "Invalid domain format");
          errors.push({
            row: i + 1,
            field: websiteColumn,
            value: row[websiteColumn],
            error: "Invalid domain format",
            suggestion,
          });
        }
      }
    }

    const qualityScore = calculateQualityScore(metrics);

    // Check for enrichment opportunity
    const hasDomain = Object.values(autoMapping).includes("website");
    const hasCompany = Object.values(autoMapping).includes("company");
    const suggestEnrichment = hasDomain && !hasCompany;

    return NextResponse.json({
      headers,
      sampleRows: sampleRows.slice(0, 5),
      autoMapping,
      templateMatch: templateMatch
        ? {
            sourceName: templateMatch.sourceName,
            similarity: templateMatch.similarity,
          }
        : null,
      workspaceTemplate: matchedTemplate
        ? {
            id: matchedTemplate.id,
            sourceName: matchedTemplate.source_name,
            similarity: matchedTemplate.similarity,
            mapping: matchedTemplate.mapping,
          }
        : null,
      qualityScore,
      metrics,
      sampleErrors: errors.slice(0, 10),
      suggestEnrichment,
      totalRows: records.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map((s) => s.toLowerCase().trim()));
  const setB = new Set(b.map((s) => s.toLowerCase().trim()));

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}









