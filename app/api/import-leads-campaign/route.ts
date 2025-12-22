import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_ROWS = 10000; // guardrail (allow 5–10k; we cap at 10k)
const REQUIRED = ['email'];

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const campaign_id = form.get('campaign_id') as string;
    const mapping = JSON.parse((form.get('mapping') as string) || '{}') as Record<string,string>;
    if (!file || !campaign_id) return NextResponse.json({ error: 'Missing file or campaign_id' }, { status: 400 });

    const text = await file.text();
    const records: any[] = parse(text, { columns: true, skip_empty_lines: true });
    if (records.length === 0) return NextResponse.json({ error: 'Empty CSV' }, { status: 400 });
    if (records.length > MAX_ROWS) return NextResponse.json({ error: `Row cap exceeded (${records.length} > ${MAX_ROWS})` }, { status: 400 });

    // Get campaign info (user_id and dedupe_strategy)
    const { data: campaign, error: campaignErr } = await supabase
      .from('campaigns')
      .select('user_id, dedupe_strategy')
      .eq('id', campaign_id)
      .single();
    
    if (campaignErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const user_id = campaign.user_id;
    const dedupeStrategy = campaign.dedupe_strategy || 'per_campaign';

    // Build rows
    const errors: { row: number; reason: string }[] = [];
    const parsedCsvRows: Array<{ row: number; email: string; first_name?: string; last_name?: string; company?: string }> = [];

    // STEP 1: Parse and validate CSV rows
    records.forEach((r, i) => {
      const rowNum = i + 2; // considering header row
      const email = (r[mapping.email] || '').toString().trim();
      
      // Validate required
      if (!email) {
        errors.push({ row: rowNum, reason: `Missing required email` });
        return;
      }

      parsedCsvRows.push({
        row: rowNum,
        email: email.toLowerCase(),
        first_name: mapping.first_name ? (r[mapping.first_name] || '').toString().trim() : undefined,
        last_name: mapping.last_name ? (r[mapping.last_name] || '').toString().trim() : undefined,
        company: mapping.company ? (r[mapping.company] || '').toString().trim() : undefined,
      });
    });

    // STEP 2: Deduplicate inside the CSV itself
    const uniqueRows: typeof parsedCsvRows = [];
    const seen = new Set<string>();
    for (const row of parsedCsvRows) {
      const emailLower = row.email.toLowerCase().trim();
      if (!seen.has(emailLower)) {
        seen.add(emailLower);
        uniqueRows.push(row);
      } else {
        errors.push({ row: row.row, reason: 'Duplicate email in CSV file' });
      }
    }
    const duplicatesInsideCsv = parsedCsvRows.length - uniqueRows.length;

    // STEP 3: Detect Campaign-Level Duplicates
    const uniqueEmails = uniqueRows.map(r => r.email.toLowerCase());
    const { data: existingCampaignLeads, error: exErr } = await supabase
      .from('leads')
      .select('email')
      .eq('campaign_id', campaign_id)
      .in('email', uniqueEmails);
    if (exErr) throw exErr;

    const campaignSet = new Set((existingCampaignLeads || []).map((l: any) => l.email.toLowerCase()));
    let filtered = uniqueRows.filter((row) => !campaignSet.has(row.email.toLowerCase()));
    const duplicatesInCampaign = uniqueRows.length - filtered.length;

    // Add errors for campaign duplicates
    uniqueRows.forEach(row => {
      if (campaignSet.has(row.email.toLowerCase())) {
        errors.push({ row: row.row, reason: 'Duplicate email in campaign' });
      }
    });

    // STEP 4: Detect Global Duplicates (if strategy is 'global')
    let duplicatesGlobal = 0;
    if (dedupeStrategy === 'global') {
      const { data: globalLeads, error: globalErr } = await supabase
        .from('smartsend_global_leads')
        .select('email')
        .eq('user_id', user_id)
        .in('email', filtered.map(r => r.email.toLowerCase()));
      
      if (!globalErr && globalLeads) {
        const globalSet = new Set(globalLeads.map((l: any) => l.email.toLowerCase()));
        const beforeGlobal = filtered.length;
        filtered = filtered.filter((row) => !globalSet.has(row.email.toLowerCase()));
        duplicatesGlobal = beforeGlobal - filtered.length;

        // Add errors for global duplicates
        uniqueRows.forEach(row => {
          if (globalSet.has(row.email.toLowerCase()) && !campaignSet.has(row.email.toLowerCase())) {
            errors.push({ row: row.row, reason: 'Duplicate email in global index' });
          }
        });
      }
    }

    // STEP 5: Domain-Level Dedupe (if strategy is 'domain')
    let duplicatesDomain = 0;
    if (dedupeStrategy === 'domain') {
      const existingDomains = new Set(
        (existingCampaignLeads || []).map((l: any) => {
          const parts = l.email.toLowerCase().split('@');
          return parts.length === 2 ? parts[1] : null;
        }).filter(Boolean)
      );
      
      const beforeDomain = filtered.length;
      filtered = filtered.filter((row) => {
        const parts = row.email.split('@');
        if (parts.length !== 2) return true; // Keep invalid emails for error handling
        const domain = parts[1].toLowerCase();
        return !existingDomains.has(domain);
      });
      duplicatesDomain = beforeDomain - filtered.length;

      // Add errors for domain duplicates
      uniqueRows.forEach(row => {
        const parts = row.email.split('@');
        if (parts.length === 2) {
          const domain = parts[1].toLowerCase();
          if (existingDomains.has(domain) && !campaignSet.has(row.email.toLowerCase())) {
            errors.push({ row: row.row, reason: 'Duplicate domain in campaign' });
          }
        }
      });
    }

    // Build batch for insertion
    const batch = filtered.map((row) => ({
      campaign_id,
      user_id,
      email: row.email,
      first_name: row.first_name || null,
      last_name: row.last_name || null,
      company: row.company || null,
      status: 'queued',
    }));

    // Bulk insert in chunks
    let inserted = 0;
    const CHUNK = 1000;
    for (let i = 0; i < batch.length; i += CHUNK) {
      const slice = batch.slice(i, i + CHUNK);
      const { error } = await supabase.from('leads').insert(slice);
      if (error) {
        // Fallback: mark all slice rows as errors (coarse-grained)
        for (let k = 0; k < slice.length; k++) {
          const idx = i + k;
          errors.push({ row: filtered[idx]?.row || idx + 2, reason: error.message });
        }
      } else {
        inserted += slice.length;
      }
    }

    // STEP 6: Insert into Global Index (for all imported leads)
    if (inserted > 0) {
      const importedEmails = batch.slice(0, inserted).map(r => r.email.toLowerCase());
      const globalRows = importedEmails.map(email => ({
        user_id,
        email: email.toLowerCase(),
      }));

      // Insert in chunks - duplicates will be silently ignored by unique constraint
      for (let i = 0; i < globalRows.length; i += CHUNK) {
        const chunk = globalRows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('smartsend_global_leads')
          .insert(chunk);
        // Ignore duplicate key errors (they're expected)
        if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
          console.warn('Failed to insert into global leads (non-fatal):', error.message);
        }
      }
    }

    // Build a downloadable error CSV (served by Next static blob URL)
    let errorCsvUrl: string | null = null;
    if (errors.length) {
      const csv = ['row,reason', ...errors.map(e => `${e.row},"${e.reason.replace(/"/g,'""')}"`)].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      // In Next.js route handlers we can't directly serve a blob URL to the client; instead return data and let client create object URL.
      // So we return the CSV data and the client constructs a Blob URL. To keep client simple, we'll base64 encode here.
      const b64 = Buffer.from(csv).toString('base64');
      errorCsvUrl = `data:text/csv;base64,${b64}`;
    }

    return NextResponse.json({ 
      imported: inserted, 
      skipped: records.length - inserted,
      errors: errors.length, 
      errorCsvUrl,
      duplicates_inside_csv: duplicatesInsideCsv,
      duplicates_in_campaign: duplicatesInCampaign,
      duplicates_global: duplicatesGlobal,
      duplicates_domain: duplicatesDomain,
      dedupe_strategy: dedupeStrategy,
    });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
