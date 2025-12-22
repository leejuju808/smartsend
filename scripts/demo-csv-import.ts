#!/usr/bin/env tsx

/**
 * Demo script for CSV Import + Dedupe + Suppression List functionality
 * 
 * This script demonstrates:
 * 1. Creating sample CSV data
 * 2. Simulating the import process
 * 3. Showing deduplication results
 * 4. Demonstrating suppression list integration
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

// Sample CSV data for demonstration
const sampleCSVData = `email,first_name,last_name,company,phone,title,tags
john@example.com,John,Doe,Acme Corp,555-0123,CEO,"leads, hot, trial"
jane@example.com,Jane,Smith,Tech Inc,555-0124,CTO,"leads, hot"
john@example.com,John,Doe,Acme Corp,555-0123,CEO,"leads, hot, trial"
bob@example.com,Bob,Johnson,Startup LLC,555-0126,Founder,"leads"
alice@example.com,Alice,Brown,Enterprise Inc,555-0127,VP Sales,"leads, enterprise"
invalid-email,Invalid,User,Bad Corp,555-0128,Manager,"leads"
charlie@example.com,Charlie,Wilson,Consulting Co,555-0129,Partner,"leads, consulting"
diana@example.com,Diana,Martinez,Design Studio,555-0130,Creative Director,"leads, creative"`;

// Simulate the CSV import process
async function demoCSVImport() {
  console.log('🚀 SmartSend AI - CSV Import Demo\n');
  
  // Step 1: Parse CSV
  console.log('📊 Step 1: Parsing CSV Data');
  console.log('=' .repeat(50));
  
  let rows: Record<string, any>[];
  try {
    rows = parse(sampleCSVData, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    console.log(`✅ Successfully parsed ${rows.length} rows from CSV`);
    console.log(`📋 Headers: ${Object.keys(rows[0]).join(', ')}\n`);
  } catch (error) {
    console.error('❌ CSV parsing failed:', error);
    return;
  }

  // Step 2: Column Mapping Detection
  console.log('🔍 Step 2: Detecting Column Mapping');
  console.log('=' .repeat(50));
  
  const headers = Object.keys(rows[0]);
  const columnMapping = detectColumnMapping(headers);
  
  console.log('Detected column mappings:');
  Object.entries(columnMapping).forEach(([header, mappedField]) => {
    console.log(`  ${header} → ${mappedField}`);
  });
  console.log();

  // Step 3: Data Validation & Deduplication
  console.log('✅ Step 3: Data Validation & Deduplication');
  console.log('=' .repeat(50));
  
  const validationResults = validateAndDedupe(rows, columnMapping);
  
  console.log('Validation Results:');
  console.log(`  📧 Total rows: ${rows.length}`);
  console.log(`  ✅ Valid emails: ${validationResults.validContacts.length}`);
  console.log(`  ❌ Invalid emails: ${validationResults.invalidEmails.length}`);
  console.log(`  🔄 Duplicates in file: ${validationResults.duplicatesInFile.size}`);
  console.log(`  🎯 Unique after dedup: ${validationResults.uniqueContacts.length}`);
  console.log();

  // Step 4: Show Sample Data
  console.log('📋 Step 4: Sample Processed Data');
  console.log('=' .repeat(50));
  
  validationResults.uniqueContacts.slice(0, 3).forEach((contact, index) => {
    console.log(`Contact ${index + 1}:`);
    console.log(`  Email: ${contact.email}`);
    console.log(`  Name: ${contact.name || 'N/A'}`);
    console.log(`  Company: ${contact.company || 'N/A'}`);
    console.log(`  Title: ${contact.title || 'N/A'}`);
    console.log(`  Tags: ${contact.tags?.join(', ') || 'None'}`);
    console.log();
  });

  // Step 5: Suppression List Demo
  console.log('🚫 Step 5: Suppression List Integration');
  console.log('=' .repeat(50));
  
  const suppressionList = ['jane@example.com', 'bob@example.com'];
  console.log(`Suppression list contains: ${suppressionList.join(', ')}`);
  
  const filteredContacts = validationResults.uniqueContacts.filter(
    contact => !suppressionList.includes(contact.email.toLowerCase())
  );
  
  console.log(`Contacts after suppression filtering: ${filteredContacts.length}`);
  console.log(`Suppressed contacts: ${validationResults.uniqueContacts.length - filteredContacts.length}`);
  console.log();

  // Step 6: Import Summary
  console.log('📈 Step 6: Import Summary');
  console.log('=' .repeat(50));
  
  const summary = {
    total_in_file: rows.length,
    valid_emails: validationResults.validContacts.length,
    invalid_emails: validationResults.invalidEmails.length,
    unique_after_dedup: validationResults.uniqueContacts.length,
    duplicates_in_file: validationResults.duplicatesInFile.size,
    suppressed_skipped: validationResults.uniqueContacts.length - filteredContacts.length,
    final_import_count: filteredContacts.length
  };
  
  console.log('Final Import Summary:');
  Object.entries(summary).forEach(([key, value]) => {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    console.log(`  ${label}: ${value}`);
  });
  
  console.log('\n🎉 Demo completed successfully!');
  console.log('\nThis demonstrates how SmartSend AI handles:');
  console.log('  • CSV parsing with various formats');
  console.log('  • Intelligent column mapping');
  console.log('  • Email validation and deduplication');
  console.log('  • Suppression list integration');
  console.log('  • Comprehensive import reporting');
}

// Helper function to detect column mapping
function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  
  headers.forEach(header => {
    const lowerHeader = header.toLowerCase().trim();
    
    if (lowerHeader.includes('email') || lowerHeader === 'e-mail') {
      mapping[header] = 'email';
    } else if (lowerHeader.includes('first') || lowerHeader.includes('given')) {
      mapping[header] = 'first_name';
    } else if (lowerHeader.includes('last') || lowerHeader.includes('family') || lowerHeader.includes('surname')) {
      mapping[header] = 'last_name';
    } else if (lowerHeader.includes('name') && !lowerHeader.includes('first') && !lowerHeader.includes('last')) {
      mapping[header] = 'name';
    } else if (lowerHeader.includes('company') || lowerHeader.includes('organization') || lowerHeader.includes('org')) {
      mapping[header] = 'company';
    } else if (lowerHeader.includes('phone') || lowerHeader.includes('mobile') || lowerHeader.includes('cell')) {
      mapping[header] = 'phone';
    } else if (lowerHeader.includes('title') || lowerHeader.includes('job') || lowerHeader.includes('position')) {
      mapping[header] = 'title';
    } else if (lowerHeader.includes('website') || lowerHeader.includes('url') || lowerHeader.includes('site')) {
      mapping[header] = 'website';
    } else if (lowerHeader.includes('industry') || lowerHeader.includes('sector')) {
      mapping[header] = 'industry';
    } else if (lowerHeader.includes('tag') || lowerHeader.includes('label') || lowerHeader.includes('category')) {
      mapping[header] = 'tags';
    }
  });
  
  return mapping;
}

// Helper function to validate emails
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper function to process contacts
function validateAndDedupe(rows: Record<string, any>[], columnMapping: Record<string, string>) {
  const validContacts: any[] = [];
  const invalidEmails: string[] = [];
  const emailMap = new Map<string, any>();
  const duplicatesInFile = new Set<string>();
  
  rows.forEach((row, index) => {
    // Find email value using column mapping
    const emailKey = Object.keys(columnMapping).find(key => columnMapping[key] === 'email');
    if (!emailKey) return;
    
    const email = row[emailKey]?.trim().toLowerCase();
    if (!email) {
      invalidEmails.push(`Row ${index + 2}: Missing email`);
      return;
    }
    
    if (!validateEmail(email)) {
      invalidEmails.push(email);
      return;
    }
    
    // Check for duplicates within file
    if (emailMap.has(email)) {
      duplicatesInFile.add(email);
      return;
    }
    
    // Build contact object
    const contact: any = { email };
    
    // Map other fields
    Object.keys(columnMapping).forEach(header => {
      const fieldType = columnMapping[header];
      if (fieldType === 'email') return;
      
      if (fieldType === 'first_name' || fieldType === 'last_name') {
        contact[fieldType] = row[header]?.trim() || undefined;
      } else if (fieldType === 'name' && !contact.first_name && !contact.last_name) {
        contact.name = row[header]?.trim() || undefined;
      } else if (fieldType === 'company') {
        contact.company = row[header]?.trim() || undefined;
      } else if (fieldType === 'phone') {
        contact.phone = row[header]?.trim() || undefined;
      } else if (fieldType === 'title') {
        contact.title = row[header]?.trim() || undefined;
      } else if (fieldType === 'tags') {
        contact.tags = row[header]?.trim()?.split(/[,;|]/).map((t: string) => t.trim()).filter((t: string) => t) || undefined;
      }
    });
    
    // Combine first/last names
    if (contact.first_name && contact.last_name) {
      contact.name = `${contact.first_name} ${contact.last_name}`.trim();
      delete contact.first_name;
      delete contact.last_name;
    }
    
    // Clean up undefined values
    Object.keys(contact).forEach(key => {
      if (contact[key] === undefined) {
        delete contact[key];
      }
    });
    
    emailMap.set(email, contact);
    validContacts.push(contact);
  });
  
  return {
    validContacts,
    invalidEmails,
    duplicatesInFile,
    uniqueContacts: Array.from(emailMap.values())
  };
}

// Run the demo
if (require.main === module) {
  demoCSVImport().catch(console.error);
}

export { demoCSVImport, detectColumnMapping, validateEmail, validateAndDedupe }; 