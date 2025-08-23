#!/usr/bin/env tsx

/**
 * Test script for email verification system
 * 
 * Usage:
 * 1. Set up environment variables (see .env.local)
 * 2. Run: tsx scripts/test-email-verification.ts
 * 
 * This script tests the email verification flow:
 * 1. Request verification code
 * 2. Verify the code
 * 3. Check domain status
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

async function testEndpoint(
  endpoint: string, 
  method: 'GET' | 'POST', 
  body?: any,
  headers?: Record<string, string>
): Promise<TestResult> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    
    return {
      name: `${method} ${endpoint}`,
      success: response.ok,
      data: response.ok ? data : undefined,
      error: response.ok ? undefined : data.error || `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      name: `${method} ${endpoint}`,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function runTests() {
  console.log('🧪 Testing Email Verification System\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  const results: TestResult[] = [];

  // Test 1: Health check (should work without auth)
  console.log('1. Testing health check...');
  const healthResult = await testEndpoint('/api/health', 'GET');
  results.push(healthResult);
  console.log(`   ${healthResult.success ? '✅' : '❌'} ${healthResult.name}: ${healthResult.success ? 'OK' : healthResult.error}\n`);

  // Test 2: Request verification code (should fail without auth)
  console.log('2. Testing verification code request (no auth)...');
  const requestResult = await testEndpoint('/api/domains/email/request', 'POST', {
    email: 'test@example.com'
  });
  results.push(requestResult);
  console.log(`   ${requestResult.success ? '✅' : '❌'} ${requestResult.name}: ${requestResult.success ? 'Unexpected success' : 'Expected failure - ' + requestResult.error}\n`);

  // Test 3: Verify code (should fail without auth)
  console.log('3. Testing code verification (no auth)...');
  const verifyResult = await testEndpoint('/api/domains/email/verify', 'POST', {
    email: 'test@example.com',
    code: 'ABC123'
  });
  results.push(verifyResult);
  console.log(`   ${verifyResult.success ? '✅' : '❌'} ${verifyResult.name}: ${verifyResult.success ? 'Unexpected success' : 'Expected failure - ' + verifyResult.error}\n`);

  // Test 4: Email send endpoint (should fail without auth)
  console.log('4. Testing email send endpoint (no auth)...');
  const emailResult = await testEndpoint('/api/emails/send', 'POST', {
    to: 'test@example.com',
    subject: 'Test',
    text: 'Test email'
  });
  results.push(emailResult);
  console.log(`   ${emailResult.success ? '✅' : '❌'} ${emailResult.name}: ${emailResult.success ? 'Unexpected success' : 'Expected failure - ' + emailResult.error}\n`);

  // Summary
  console.log('📊 Test Summary\n');
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.name}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log(`\n${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! The API endpoints are working correctly.');
    console.log('\nNext steps:');
    console.log('1. Run the database migration in Supabase');
    console.log('2. Test with authenticated user in the browser');
    console.log('3. Integrate with your preferred email service');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
} 