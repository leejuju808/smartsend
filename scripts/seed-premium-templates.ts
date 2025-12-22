#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PremiumTemplate {
  slug: string;
  name: string;
  description: string;
  amount_cents: number;
  currency: string;
  interval?: string;
}

async function seedPremiumTemplates() {
  console.log('🌱 Seeding premium templates...');
  
  // Load premium templates data
  const templatesPath = path.join(process.cwd(), 'data', 'premiumTemplates.json');
  const templatesData = fs.readFileSync(templatesPath, 'utf8');
  const templates: PremiumTemplate[] = JSON.parse(templatesData);
  
  console.log(`📋 Found ${templates.length} premium templates to seed`);
  
  const results: { slug: string; status: string }[] = [];
  
  for (const template of templates) {
    console.log(`\n🌱 Processing: ${template.name} (${template.slug})`);
    
    try {
      // Check if template already exists
      const { data: existing } = await supabase
        .from('marketplace_templates')
        .select('id, is_premium')
        .eq('slug', template.slug)
        .maybeSingle();
      
      if (existing) {
        // Update existing template to be premium
        const { error } = await supabase
          .from('marketplace_templates')
          .update({ 
            is_premium: true,
            name: template.name,
            description: template.description
          })
          .eq('id', existing.id);
        
        if (error) {
          console.log(`  ❌ Update failed: ${error.message}`);
          results.push({ slug: template.slug, status: 'update_failed' });
        } else {
          console.log(`  ✅ Updated existing template to premium`);
          results.push({ slug: template.slug, status: 'updated' });
        }
      } else {
        // Create new premium template
        const { error } = await supabase
          .from('marketplace_templates')
          .insert({
            slug: template.slug,
            name: template.name,
            description: template.description,
            kind: 'sequence', // Default to sequence
            is_premium: true,
            tags: ['premium', 'pro'],
            rating: 4.8, // High rating for premium
            installs: 0,
            payload: {
              name: template.name,
              steps: [
                {
                  subject: `[${template.name}] Step 1`,
                  body_text: `This is the first step of the ${template.name} sequence.`,
                  delay_days: 0,
                  condition: 'always'
                },
                {
                  subject: `[${template.name}] Step 2`,
                  body_text: `This is the second step of the ${template.name} sequence.`,
                  delay_days: 2,
                  condition: 'always'
                }
              ]
            }
          });
        
        if (error) {
          console.log(`  ❌ Creation failed: ${error.message}`);
          results.push({ slug: template.slug, status: 'creation_failed' });
        } else {
          console.log(`  ✅ Created new premium template`);
          results.push({ slug: template.slug, status: 'created' });
        }
      }
      
    } catch (error: any) {
      console.error(`  ❌ Error processing ${template.slug}:`, error.message);
      results.push({ slug: template.slug, status: 'error' });
    }
  }
  
  console.log('\n📊 Seed Summary:');
  console.log('================');
  results.forEach(result => {
    const emoji = result.status === 'created' || result.status === 'updated' ? '✅' : '❌';
    console.log(`${emoji} ${result.slug}: ${result.status}`);
  });
  
  const successCount = results.filter(r => r.status === 'created' || r.status === 'updated').length;
  console.log(`\n✅ Seed completed! ${successCount}/${templates.length} templates processed successfully.`);
  
  console.log('\n💡 Next steps:');
  console.log('1. Run: npm run stripe:sync');
  console.log('2. Test the marketplace with premium templates');
  
  return results;
}

// Run if called directly
if (require.main === module) {
  seedPremiumTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

export { seedPremiumTemplates }; 