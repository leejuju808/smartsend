/**
 * POST /api/import/preview
 * Preview import with validation, enrichment detection, and duplicate checking
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateEmail } from '@/lib/import/email-validation';
import { checkDuplicate } from '@/lib/import/duplicate-detection';

export const runtime = 'nodejs';

interface PreviewRow {
  rowNumber: number;
  rawData: Record<string, any>;
  mappedData: {
    email?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    notes?: string;
    past_quote_amount?: number;
    appointment_date?: string;
  };
  validation: {
    isValid: boolean;
    isMissingEmail: boolean;
    isInvalidEmail: boolean;
    isDuplicate: boolean;
    isSuppressed: boolean;
    errors: string[];
  };
  enrichment: {
    willEnrichCity: boolean;
    willEnrichZip: boolean;
    willEnrichNeighborhood: boolean;
  };
  tags: {
    willApplyTags: string[];
    stormZoneMatch: boolean;
    neighborhoodMatch: boolean;
  };
  duplicateMatch?: {
    contactId: string;
    matchType: string;
    matchScore: number;
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      rows,
      fieldMapping,
      workspaceId,
      defaultTags = [],
    } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'Rows array is required' },
        { status: 400 }
      );
    }

    if (!fieldMapping || typeof fieldMapping !== 'object') {
      return NextResponse.json(
        { error: 'Field mapping is required' },
        { status: 400 }
      );
    }

    // Get workspace_id if not provided
    let finalWorkspaceId = workspaceId;
    if (!finalWorkspaceId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: 'No workspace found' },
          { status: 404 }
        );
      }

      finalWorkspaceId = membership.workspace_id;
    }

    // Get suppressed emails
    const { data: suppressed } = await supabase
      .from('suppressions')
      .select('email')
      .eq('workspace_id', finalWorkspaceId);

    const suppressedEmails = new Set(
      (suppressed || []).map((s) => s.email?.toLowerCase().trim()).filter(Boolean)
    );

    // Preview first 25 rows
    const previewRows: PreviewRow[] = [];
    const rowsToPreview = rows.slice(0, 25);

    for (let i = 0; i < rowsToPreview.length; i++) {
      const row = rowsToPreview[i];
      const rowNumber = i + 1;

      // Map fields
      const mappedData: PreviewRow['mappedData'] = {};
      for (const [csvColumn, fieldName] of Object.entries(fieldMapping)) {
        if (fieldName && row[csvColumn] !== undefined && row[csvColumn] !== null && row[csvColumn] !== '') {
          const value = String(row[csvColumn]).trim();
          
          switch (fieldName) {
            case 'email':
              mappedData.email = value.toLowerCase();
              break;
            case 'first_name':
              mappedData.first_name = value;
              break;
            case 'last_name':
              mappedData.last_name = value;
              break;
            case 'full_name':
              mappedData.full_name = value;
              break;
            case 'address':
              mappedData.address = value;
              break;
            case 'city':
              mappedData.city = value;
              break;
            case 'state':
              mappedData.state = value;
              break;
            case 'zip':
            case 'postal_code':
              mappedData.zip = value;
              break;
            case 'phone':
              mappedData.phone = value;
              break;
            case 'notes':
              mappedData.notes = value;
              break;
            case 'past_quote_amount':
              const amount = parseFloat(value.replace(/[^0-9.]/g, ''));
              if (!isNaN(amount)) {
                mappedData.past_quote_amount = amount;
              }
              break;
            case 'appointment_date':
              mappedData.appointment_date = value;
              break;
          }
        }
      }

      // Split full_name if provided
      if (mappedData.full_name && !mappedData.first_name && !mappedData.last_name) {
        const parts = mappedData.full_name.split(/\s+/);
        if (parts.length > 0) {
          mappedData.first_name = parts[0];
          if (parts.length > 1) {
            mappedData.last_name = parts.slice(1).join(' ');
          }
        }
      }

      // Validate email
      const email = mappedData.email || '';
      const emailValidation = validateEmail(email);
      const isMissingEmail = !email || email.trim() === '';
      const isInvalidEmail = !emailValidation.isValid;
      const isSuppressed = suppressedEmails.has(email.toLowerCase().trim());

      // Check duplicate
      let duplicateCheck = null;
      let duplicateMatch: PreviewRow['duplicateMatch'] = undefined;
      if (!isMissingEmail && !isInvalidEmail && !isSuppressed) {
        duplicateCheck = await checkDuplicate(
          email,
          mappedData.first_name,
          mappedData.last_name,
          mappedData.address,
          mappedData.zip,
          mappedData.phone,
          finalWorkspaceId,
          supabase
        );

        if (duplicateCheck.isDuplicate && duplicateCheck.bestMatch) {
          duplicateMatch = {
            contactId: duplicateCheck.bestMatch.contactId,
            matchType: duplicateCheck.bestMatch.matchType,
            matchScore: duplicateCheck.bestMatch.matchScore,
          };
        }
      }

      // Determine enrichment potential
      const enrichment = {
        willEnrichCity: !mappedData.city && (!!mappedData.address || !!mappedData.zip),
        willEnrichZip: !mappedData.zip && !!mappedData.address,
        willEnrichNeighborhood: !!mappedData.zip || !!mappedData.city,
      };

      // Determine tags to apply
      const tagsToApply: string[] = [...defaultTags];
      
      // Auto-tags based on data
      if (mappedData.past_quote_amount) {
        tagsToApply.push('old_quote');
      }
      
      if (mappedData.zip) {
        // Check if zip is in storm zone (simplified - would check actual storm data)
        // For now, just indicate potential
        tagsToApply.push('potential_storm');
      }

      const validation = {
        isValid: !isMissingEmail && !isInvalidEmail && !isSuppressed && !duplicateCheck?.isDuplicate,
        isMissingEmail,
        isInvalidEmail,
        isDuplicate: duplicateCheck?.isDuplicate || false,
        isSuppressed,
        errors: [] as string[],
      };

      if (isMissingEmail) validation.errors.push('Missing email');
      if (isInvalidEmail) validation.errors.push(`Invalid email: ${emailValidation.reason || 'malformed'}`);
      if (isSuppressed) validation.errors.push('Email is suppressed');
      if (duplicateCheck?.isDuplicate) validation.errors.push(`Duplicate: ${duplicateMatch?.matchReason || 'found existing contact'}`);

      previewRows.push({
        rowNumber,
        rawData: row,
        mappedData,
        validation,
        enrichment,
        tags: {
          willApplyTags: tagsToApply,
          stormZoneMatch: !!mappedData.zip, // Simplified
          neighborhoodMatch: enrichment.willEnrichNeighborhood,
        },
        duplicateMatch,
      });
    }

    // Summary statistics
    const summary = {
      totalRows: rows.length,
      previewedRows: previewRows.length,
      validRows: previewRows.filter((r) => r.validation.isValid).length,
      invalidRows: previewRows.filter((r) => !r.validation.isValid).length,
      missingEmail: previewRows.filter((r) => r.validation.isMissingEmail).length,
      invalidEmail: previewRows.filter((r) => r.validation.isInvalidEmail).length,
      duplicates: previewRows.filter((r) => r.validation.isDuplicate).length,
      suppressed: previewRows.filter((r) => r.validation.isSuppressed).length,
      willEnrich: previewRows.filter(
        (r) => r.enrichment.willEnrichCity || r.enrichment.willEnrichZip || r.enrichment.willEnrichNeighborhood
      ).length,
      tagsToApply: Array.from(new Set(previewRows.flatMap((r) => r.tags.willApplyTags))),
    };

    return NextResponse.json({
      preview: previewRows,
      summary,
    });
  } catch (error: any) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to preview import' },
      { status: 500 }
    );
  }
}





















































