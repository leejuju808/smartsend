import { createClient } from '@supabase/supabase-js';
import { ParsedContact } from './parseCsv';
import { ContactInput } from './schema';

export interface InsertResult {
  inserted: number;
  duplicates: number;
  suppressed: number;
  errors: number;
  totalProcessed: number;
}

export interface InsertOptions {
  workspaceId: string;
  importBatchId?: string;
  onConflict?: 'skip' | 'update';
  respectSuppression?: boolean;
}

/**
 * Insert contacts with deduplication and suppression handling
 */
export async function insertContacts(
  contacts: ParsedContact[],
  options: InsertOptions
): Promise<InsertResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const result: InsertResult = {
    inserted: 0,
    duplicates: 0,
    suppressed: 0,
    errors: 0,
    totalProcessed: contacts.length
  };

  try {
    // Set workspace context for RLS
    await supabase.rpc('app.set_workspace', { workspace_id: options.workspaceId });

    // 1. In-memory deduplication
    const uniqueContacts = dedupeInMemory(contacts);
    result.duplicates += contacts.length - uniqueContacts.length;

    // 2. Check suppression if enabled
    let contactsToProcess = uniqueContacts;
    if (options.respectSuppression !== false) {
      const { suppressed, notSuppressed } = await filterSuppressedEmails(
        uniqueContacts.map(c => c.email),
        options.workspaceId,
        supabase
      );
      contactsToProcess = uniqueContacts.filter(c => 
        notSuppressed.includes(c.email.toLowerCase())
      );
      result.suppressed += suppressed.length;
    }

    if (contactsToProcess.length === 0) {
      return result;
    }

    // 3. Check for existing contacts in database
    const { existingEmails, newContacts } = await checkExistingContacts(
      contactsToProcess,
      options.workspaceId,
      supabase
    );

    result.duplicates += existingEmails.length;

    if (newContacts.length === 0) {
      return result;
    }

    // 4. Prepare contacts for insertion
    const contactsToInsert = newContacts.map(contact => ({
      workspace_id: options.workspaceId,
      email: contact.email.toLowerCase(),
      first_name: contact.first_name || null,
      last_name: contact.last_name || null,
      company: contact.company || null,
      title: contact.title || null,
      phone: contact.phone || null,
      tags: [],
      last_source: 'import',
      import_batch_id: options.importBatchId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // 5. Bulk insert in batches
    const batchSize = 1000; // Supabase recommended batch size
    for (let i = 0; i < contactsToInsert.length; i += batchSize) {
      const batch = contactsToInsert.slice(i, i + batchSize);
      
      const { error, count } = await supabase
        .from('contacts')
        .insert(batch, { count: 'exact' });

      if (error) {
        console.error('Batch insert error:', error);
        result.errors += batch.length;
      } else {
        result.inserted += count || batch.length;
      }
    }

    // 6. Update import batch if provided
    if (options.importBatchId) {
      await updateImportBatch(
        options.importBatchId,
        result,
        supabase
      );
    }

  } catch (error) {
    console.error('Contact insertion error:', error);
    result.errors += contacts.length;
  }

  return result;
}

/**
 * Deduplicate contacts in memory based on email
 */
function dedupeInMemory(contacts: ParsedContact[]): ParsedContact[] {
  const seen = new Set<string>();
  const unique: ParsedContact[] = [];

  for (const contact of contacts) {
    const email = contact.email.toLowerCase().trim();
    if (!seen.has(email)) {
      seen.add(email);
      unique.push(contact);
    }
  }

  return unique;
}

/**
 * Filter out suppressed emails
 */
async function filterSuppressedEmails(
  emails: string[],
  workspaceId: string,
  supabase: any
): Promise<{ suppressed: string[], notSuppressed: string[] }> {
  if (emails.length === 0) {
    return { suppressed: [], notSuppressed: [] };
  }

  const { data: suppressedData, error } = await supabase
    .from('suppression_emails')
    .select('email')
    .eq('workspace_id', workspaceId)
    .in('email', emails.map(e => e.toLowerCase()));

  if (error) {
    console.error('Error checking suppression:', error);
    return { suppressed: [], notSuppressed: emails };
  }

  const suppressedEmails = new Set(
    (suppressedData || []).map((s: any) => s.email.toLowerCase())
  );

  const suppressed: string[] = [];
  const notSuppressed: string[] = [];

  emails.forEach(email => {
    const lowerEmail = email.toLowerCase();
    if (suppressedEmails.has(lowerEmail)) {
      suppressed.push(lowerEmail);
    } else {
      notSuppressed.push(lowerEmail);
    }
  });

  return { suppressed, notSuppressed };
}

/**
 * Check which contacts already exist in the database
 */
async function checkExistingContacts(
  contacts: ParsedContact[],
  workspaceId: string,
  supabase: any
): Promise<{ existingEmails: string[], newContacts: ParsedContact[] }> {
  if (contacts.length === 0) {
    return { existingEmails: [], newContacts: [] };
  }

  const emails = contacts.map(c => c.email.toLowerCase());
  
  const { data: existingData, error } = await supabase
    .from('contacts')
    .select('email')
    .eq('workspace_id', workspaceId)
    .in('email', emails);

  if (error) {
    console.error('Error checking existing contacts:', error);
    return { existingEmails: [], newContacts: contacts };
  }

  const existingEmails = new Set(
    (existingData || []).map((c: any) => (c.email as string).toLowerCase())
  );

  const newContacts = contacts.filter(c => 
    !existingEmails.has(c.email.toLowerCase())
  );

  return {
    existingEmails: Array.from(existingEmails) as string[],
    newContacts
  };
}

/**
 * Update import batch with results
 */
async function updateImportBatch(
  batchId: string,
  result: InsertResult,
  supabase: any
): Promise<void> {
  try {
    await supabase
      .from('import_batches')
      .update({
        inserted_count: result.inserted,
        duplicate_count: result.duplicates,
        suppressed_count: result.suppressed,
        error_count: result.errors,
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', batchId);
  } catch (error) {
    console.error('Error updating import batch:', error);
  }
}

/**
 * Create a new import batch
 */
export async function createImportBatch(
  workspaceId: string,
  filename: string,
  totalRows: number
): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('import_batches')
    .insert({
      workspace_id: workspaceId,
      filename,
      total_rows: totalRows,
      status: 'processing'
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create import batch: ${error.message}`);
  }

  return data.id;
} 