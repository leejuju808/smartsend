#!/usr/bin/env tsx

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
  apiVersion: '2025-07-30.basil' 
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PremiumTemplate {
  slug: string;
  title: string;
  amount_cents: number;
  currency: string;
  interval?: string;
  description: string;
}

async function syncStripeTemplatePrices() {
  console.log('🔄 Starting Stripe template price sync...');
  
  // Load premium templates data
  const templatesPath = path.join(process.cwd(), 'data', 'premiumTemplates.json');
  const templatesData = fs.readFileSync(templatesPath, 'utf8');
  const templates: PremiumTemplate[] = JSON.parse(templatesData);
  
  console.log(`📋 Found ${templates.length} premium templates to sync`);
  
  const results: { slug: string; price_id: string; amount_cents: number }[] = [];
  
  for (const template of templates) {
    console.log(`\n🔄 Processing: ${template.title} (${template.slug})`);
    
    try {
      // Check if product already exists
      let product: Stripe.Product;
      const existingProducts = await stripe.products.list({
        limit: 100,
        active: true
      });
      
      const existingProduct = existingProducts.data.find(p => 
        p.metadata?.slug === template.slug
      );
      
      if (existingProduct) {
        console.log(`  ✅ Product exists: ${existingProduct.id}`);
        product = existingProduct;
      } else {
        // Create new product
        product = await stripe.products.create({
          name: template.title,
          description: template.description,
          metadata: {
            slug: template.slug,
            type: 'marketplace_template'
          }
        });
        console.log(`  ✅ Created product: ${product.id}`);
      }
      
      // Check if price already exists
      let price: Stripe.Price;
      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true
      });
      
      const existingPrice = existingPrices.data.find(p => 
        p.unit_amount === template.amount_cents &&
        p.currency === template.currency &&
        p.type === 'one_time'
      );
      
      if (existingPrice) {
        console.log(`  ✅ Price exists: ${existingPrice.id} ($${(template.amount_cents / 100).toFixed(2)})`);
        price = existingPrice;
      } else {
        // Create new price
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: template.amount_cents,
          currency: template.currency,
          recurring: undefined, // one-time
          metadata: {
            slug: template.slug,
            template_type: 'marketplace'
          }
        });
        console.log(`  ✅ Created price: ${price.id} ($${(template.amount_cents / 100).toFixed(2)})`);
      }
      
      // Update database with stripe_price_id
      const { error } = await supabase
        .from('marketplace_templates')
        .update({ 
          stripe_price_id: price.id,
          is_premium: true
        })
        .eq('slug', template.slug);
      
      if (error) {
        console.log(`  ⚠️  Database update failed: ${error.message}`);
      } else {
        console.log(`  ✅ Database updated with price_id: ${price.id}`);
        results.push({
          slug: template.slug,
          price_id: price.id,
          amount_cents: template.amount_cents
        });
      }
      
    } catch (error: any) {
      console.error(`  ❌ Error processing ${template.slug}:`, error.message);
    }
  }
  
  console.log('\n📊 Sync Summary:');
  console.log('================');
  results.forEach(result => {
    console.log(`${result.slug} -> ${result.price_id} ($${(result.amount_cents / 100).toFixed(2)})`);
  });
  
  console.log(`\n✅ Sync completed! ${results.length}/${templates.length} templates processed.`);
  
  return results;
}

// Run if called directly
if (require.main === module) {
  syncStripeTemplatePrices()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Sync failed:', error);
      process.exit(1);
    });
}

export { syncStripeTemplatePrices }; 