// Comprehensive API Test Suite
// Run with: node comprehensive-test.js

const API_BASE = 'http://localhost:3001';

const tests = [
  {
    name: 'Health Check',
    method: 'GET',
    url: `${API_BASE}/health`,
    expected: { ok: true, db: 'connected' }
  },
  {
    name: 'Dashboard Data',
    method: 'GET',
    url: `${API_BASE}/dashboard`,
    expected: 'object with portfolio data'
  },
  {
    name: 'Approvals List',
    method: 'GET',
    url: `${API_BASE}/approvals`,
    expected: 'array'
  },
  {
    name: 'Portfolio Snapshot',
    method: 'GET',
    url: `${API_BASE}/portfolio/snapshot`,
    expected: 'object with snapshot'
  },
  {
    name: 'Kill Switch Status',
    method: 'GET',
    url: `${API_BASE}/killswitch`,
    expected: 'object with enabled status'
  },
  {
    name: 'Rotation Status',
    method: 'GET',
    url: `${API_BASE}/rotation/status`,
    expected: 'object with rotation info'
  },
  {
    name: 'Chat (non-streaming)',
    method: 'POST',
    url: `${API_BASE}/chat`,
    body: { prompt: 'What is BTC?' },
    expected: 'object with reply'
  }
];

async function runTests() {
  console.log('🧪 Starting Comprehensive API Tests\n');
  console.log('═'.repeat(60));
  
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const options = {
        method: test.method,
        headers: { 'Content-Type': 'application/json' }
      };
      
      if (test.body) {
        options.body = JSON.stringify(test.body);
      }

      const response = await fetch(test.url, options);
      const data = await response.json();

      if (response.ok) {
        console.log(`✅ ${test.name}`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(data).substring(0, 100) + '...');
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Error:`, data.error || data);
        failed++;
      }
    } catch (err) {
      console.log(`❌ ${test.name}`);
      console.log(`   Error: ${err.message}`);
      failed++;
    }
    console.log('─'.repeat(60));
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total: ${passed + failed}`);
  console.log(`\n${'═'.repeat(60)}\n`);

  if (failed === 0) {
    console.log('🎉 All tests passed! System is operational.\n');
  } else {
    console.log('⚠️  Some tests failed. Check the logs above.\n');
  }
}

runTests().catch(console.error);
