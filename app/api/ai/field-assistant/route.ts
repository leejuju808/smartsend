// Block 253300 — SmartSend AI Field Assistant v1
// API endpoint for crew members to query roofing knowledge base

import { createClient } from '@supabase/supabase-js';
import { openai } from '@/lib/openai';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

export async function POST(req: NextRequest) {
  try {
    const { query, categoryFilter } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // Generate embedding for the query using OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: query.trim()
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Search for similar documents in the knowledge base
    const { data: matchedDocs, error: searchError } = await supabase.rpc(
      'match_ai_docs',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.78,
        match_count: 8,
        category_filter: categoryFilter || null
      }
    );

    if (searchError) {
      console.error('Vector search error:', searchError);
      return NextResponse.json(
        { error: 'Failed to search knowledge base', details: searchError.message },
        { status: 500 }
      );
    }

    // Build context from matched documents
    const context = matchedDocs && matchedDocs.length > 0
      ? matchedDocs
          .map((doc: any) => `[${doc.category.toUpperCase()}] ${doc.title}\n${doc.content}`)
          .join('\n\n---\n\n')
      : 'No specific documentation found for this query.';

    // Generate AI response using GPT-4
    const systemPrompt = `You are SmartSend Field AI, an expert roofing assistant helping crew members on job sites. Your role is to:

- Provide accurate, actionable roofing installation guidance
- Reference manufacturer specifications (GAF, Owens Corning, CertainTeed, Malarkey)
- Emphasize safety procedures and OSHA compliance
- Help with troubleshooting common installation issues
- Ensure warranty compliance in your recommendations
- Be concise and practical for field use
- When uncertain, recommend consulting the project manager or manufacturer documentation

Always prioritize safety. If a question involves safety, include clear safety warnings.

Use the provided context from the SmartSend knowledge base to answer questions. If the context doesn't fully answer the question, provide the best answer you can based on general roofing knowledge, but note when information is general guidance rather than specific documentation.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Using gpt-4o for better performance, adjust if needed
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Context from SmartSend Knowledge Base:\n\n${context}\n\n---\n\nQuestion: ${query}\n\nProvide a helpful, practical answer for a crew member working on a job site.`
        }
      ],
      temperature: 0.3, // Lower temperature for more factual, consistent responses
      max_tokens: 800
    });

    const answer = completion.choices[0]?.message?.content || 'Unable to generate response.';

    // Return response with source information
    return NextResponse.json({
      answer,
      sources: matchedDocs?.map((doc: any) => ({
        title: doc.title,
        category: doc.category,
        source: doc.source,
        similarity: doc.similarity
      })) || [],
      query
    });

  } catch (error: any) {
    console.error('AI Field Assistant error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process query',
        details: error.message
      },
      { status: 500 }
    );
  }
}
























