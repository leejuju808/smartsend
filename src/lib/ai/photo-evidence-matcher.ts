// Block 256600 — SmartSend Insurance Supplement Engine v1
// Photo Evidence Matching
// AI matches photos to supplement line items

import OpenAI from 'openai';
import { classifyDamageFromPhoto } from './insurance-damage-classifier';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface PhotoEvidenceMatch {
  photoUrl: string;
  lineItemId: string;
  lineItemDescription: string;
  matchConfidence: number; // 0-100
  aiAnalysis: string;
  evidenceType: 'proves_item' | 'supports_item' | 'weak_evidence';
  recommendedUse: 'primary' | 'secondary' | 'exclude';
}

export interface PhotoEvidenceMatchingResult {
  matches: PhotoEvidenceMatch[];
  unmatchedPhotos: string[];
  unmatchedItems: string[];
  summary: string;
}

/**
 * Match photos to supplement line items using AI
 */
export async function matchPhotosToLineItems(
  photoUrls: string[],
  lineItems: Array<{
    id: string;
    description: string;
    category: string;
    reason: string;
  }>
): Promise<PhotoEvidenceMatchingResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  if (photoUrls.length === 0 || lineItems.length === 0) {
    return {
      matches: [],
      unmatchedPhotos: photoUrls,
      unmatchedItems: lineItems.map((item) => item.id),
      summary: 'No photos or line items to match.',
    };
  }

  const matches: PhotoEvidenceMatch[] = [];
  const matchedPhotoUrls = new Set<string>();
  const matchedItemIds = new Set<string>();

  // Analyze each photo and match to line items
  for (const photoUrl of photoUrls) {
    try {
      // First, classify damage in photo
      const damageAnalysis = await classifyDamageFromPhoto(photoUrl);

      // Then, match to line items using AI
      const systemPrompt = `You are SmartSend AI Photo Evidence Matcher v1. Match photos to supplement line items.

Given a photo analysis and a list of line items, determine which line items this photo provides evidence for.

Return ONLY valid JSON:
{
  "matchedItems": [
    {
      "itemId": "uuid",
      "matchConfidence": 95,
      "evidenceType": "proves_item",
      "aiAnalysis": "Photo clearly shows missing drip edge installation",
      "recommendedUse": "primary"
    }
  ]
}

Evidence types:
- "proves_item": Photo clearly shows the item is needed/missing
- "supports_item": Photo provides supporting evidence
- "weak_evidence": Photo has weak connection to item

Recommended use:
- "primary": Use as primary evidence for this item
- "secondary": Use as supporting evidence
- "exclude": Don't use this photo for this item`;

      const lineItemsText = lineItems.map((item) => 
        `- ${item.id}: ${item.description} (${item.category}) - ${item.reason}`
      ).join('\n');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: photoUrl,
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: `Photo Analysis:\n${JSON.stringify(damageAnalysis, null, 2)}\n\nLine Items to Match:\n${lineItemsText}\n\nMatch this photo to line items. Return ONLY valid JSON.`,
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        if (result.matchedItems && Array.isArray(result.matchedItems)) {
          for (const match of result.matchedItems) {
            const lineItem = lineItems.find((item) => item.id === match.itemId);
            if (lineItem) {
              matches.push({
                photoUrl,
                lineItemId: match.itemId,
                lineItemDescription: lineItem.description,
                matchConfidence: match.matchConfidence || 50,
                aiAnalysis: match.aiAnalysis || damageAnalysis.findings,
                evidenceType: match.evidenceType || 'supports_item',
                recommendedUse: match.recommendedUse || 'secondary',
              });
              matchedPhotoUrls.add(photoUrl);
              matchedItemIds.add(match.itemId);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error matching photo ${photoUrl}:`, error);
      // Continue with other photos
    }
  }

  const unmatchedPhotos = photoUrls.filter((url) => !matchedPhotoUrls.has(url));
  const unmatchedItems = lineItems
    .filter((item) => !matchedItemIds.has(item.id))
    .map((item) => item.id);

  const summary = `Matched ${matches.length} photo-to-item pairs. ${unmatchedPhotos.length} photos unmatched, ${unmatchedItems.length} items without photos.`;

  return {
    matches,
    unmatchedPhotos,
    unmatchedItems,
    summary,
  };
}

/**
 * Get best photo for a line item (highest confidence match)
 */
export function getBestPhotoForItem(
  matches: PhotoEvidenceMatch[],
  lineItemId: string
): PhotoEvidenceMatch | null {
  const itemMatches = matches
    .filter((match) => match.lineItemId === lineItemId)
    .sort((a, b) => b.matchConfidence - a.matchConfidence);

  return itemMatches.length > 0 ? itemMatches[0] : null;
}

/**
 * Get all photos for a line item
 */
export function getPhotosForItem(
  matches: PhotoEvidenceMatch[],
  lineItemId: string
): PhotoEvidenceMatch[] {
  return matches
    .filter((match) => match.lineItemId === lineItemId)
    .sort((a, b) => b.matchConfidence - a.matchConfidence);
}





















