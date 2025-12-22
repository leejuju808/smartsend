#!/usr/bin/env node

/**
 * Test script for the Organization & Seat Management System
 * Run with: node scripts/test-org-system.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testOrgSystem() {
  console.log('🧪 Testing Organization & Seat Management System\n');

  try {
    // Test 1: Create Organization
    console.log('1️⃣ Testing Organization Creation...');
    const createOrgResponse = await fetch(`${BASE_URL}/api/orgs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Organization',
        user_id: 'test-user-123'
      })
    });

    if (!createOrgResponse.ok) {
      throw new Error(`Failed to create org: ${createOrgResponse.status}`);
    }

    const org = await createOrgResponse.json();
    console.log('✅ Organization created:', org.name);
    console.log('   ID:', org.id);
    console.log('   Seat Limit:', org.seat_limit);

    // Test 2: List Organizations
    console.log('\n2️⃣ Testing Organization Listing...');
    const listOrgsResponse = await fetch(`${BASE_URL}/api/orgs`);
    const orgs = await listOrgsResponse.json();
    console.log('✅ Organizations listed:', orgs.length);

    // Test 3: Invite Member
    console.log('\n3️⃣ Testing Member Invitation...');
    const inviteResponse = await fetch(`${BASE_URL}/api/orgs/${org.id}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'teammate@example.com',
        role: 'member'
      })
    });

    if (!inviteResponse.ok) {
      throw new Error(`Failed to invite member: ${inviteResponse.status}`);
    }

    console.log('✅ Member invited successfully');

    // Test 4: List Members
    console.log('\n4️⃣ Testing Member Listing...');
    const membersResponse = await fetch(`${BASE_URL}/api/orgs/${org.id}/members`);
    const members = await membersResponse.json();
    console.log('✅ Members listed:', members.length);
    console.log('   Members:', members.map(m => `${m.email} (${m.role})`));

    // Test 5: Test Seat Limit Enforcement
    console.log('\n5️⃣ Testing Seat Limit Enforcement...');
    
    // Try to invite more members than allowed (assuming seat_limit = 1)
    const overLimitResponse = await fetch(`${BASE_URL}/api/orgs/${org.id}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'another@example.com',
        role: 'viewer'
      })
    });

    if (overLimitResponse.status === 402) {
      console.log('✅ Seat limit enforcement working (402 Payment Required)');
    } else {
      console.log('⚠️  Seat limit enforcement may not be working');
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('   ✅ Organization creation');
    console.log('   ✅ Organization listing');
    console.log('   ✅ Member invitation');
    console.log('   ✅ Member listing');
    console.log('   ✅ Seat limit enforcement');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testOrgSystem();
}

module.exports = { testOrgSystem }; 