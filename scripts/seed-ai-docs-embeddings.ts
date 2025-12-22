#!/usr/bin/env tsx
/**
 * Block 253300 — SmartSend AI Field Assistant v1
 * Seed script to generate embeddings for ai_docs knowledge base
 * 
 * Usage: npx tsx scripts/seed-ai-docs-embeddings.ts
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiApiKey = process.env.OPENAI_API_KEY!;

if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
  console.error('Missing required environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const openai = new OpenAI({ apiKey: openaiApiKey });

async function generateEmbeddings() {
  console.log('🚀 Starting AI Field Assistant knowledge base embedding generation...\n');

  // Fetch all documents without embeddings
  const { data: docs, error: fetchError } = await supabase
    .from('ai_docs')
    .select('id, title, content, embedding')
    .is('embedding', null);

  if (fetchError) {
    console.error('Error fetching documents:', fetchError);
    process.exit(1);
  }

  if (!docs || docs.length === 0) {
    console.log('✅ All documents already have embeddings. Nothing to do.');
    return;
  }

  console.log(`📚 Found ${docs.length} documents without embeddings\n`);

  // Process in batches to avoid rate limits
  const batchSize = 10;
  let processed = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(docs.length / batchSize)}...`);

    // Generate embeddings for batch
    const texts = batch.map(doc => `${doc.title}\n\n${doc.content}`);

    try {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: texts
      });

      // Update each document with its embedding
      const updates = batch.map((doc, idx) => ({
        id: doc.id,
        embedding: embeddingResponse.data[idx].embedding
      }));

      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('ai_docs')
          .update({ embedding: update.embedding })
          .eq('id', update.id);

        if (updateError) {
          console.error(`Error updating document ${update.id}:`, updateError);
        } else {
          processed++;
          console.log(`  ✓ Processed: ${batch.find(d => d.id === update.id)?.title}`);
        }
      }

      // Rate limiting: wait 1 second between batches
      if (i + batchSize < docs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      console.error(`Error processing batch:`, error.message);
      if (error.status === 429) {
        console.log('Rate limited. Waiting 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        i -= batchSize; // Retry this batch
      }
    }
  }

  console.log(`\n✅ Successfully generated embeddings for ${processed}/${docs.length} documents`);
  console.log('🎉 AI Field Assistant knowledge base is ready!\n');
}

// Run the script
generateEmbeddings().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
























