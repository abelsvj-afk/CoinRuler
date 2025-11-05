/**
 * Quick integration test for whale provider router
 * Run with: node test-whale-router.js
 */

const { fetchWhaleAlerts } = require('./dist/index');

async function testWhaleRouter() {
  console.log('🧪 Testing Whale Provider Router\n');
  
  // Test 1: Mock provider (no keys)
  console.log('Test 1: Mock provider (no API keys configured)');
  delete process.env.ABYISS_API_KEY;
  delete process.env.WHALE_ALERT_API_KEY;
  
  try {
    const result = await fetchWhaleAlerts(['BTC', 'ETH']);
    console.log(`✅ Mock returned ${result.length} transactions`);
    console.log(`   Source: ${result[0].source}, USD: $${result[0].usdValue.toFixed(2)}`);
  } catch (e) {
    console.log(`❌ Mock failed: ${e.message}`);
  }
  
  console.log('');
  
  // Test 2: Whale Alert provider (if key exists in env)
  if (process.env.WHALE_ALERT_API_KEY) {
    console.log('Test 2: Whale Alert provider');
    try {
      const result = await fetchWhaleAlerts(['BTC']);
      console.log(`✅ Whale Alert returned ${result.length} transactions`);
      if (result.length > 0) {
        console.log(`   First: ${result[0].symbol} $${result[0].usdValue.toFixed(2)}`);
      }
    } catch (e) {
      console.log(`⚠️  Whale Alert failed (expected if no key): ${e.message}`);
    }
  } else {
    console.log('Test 2: ⏭️  Skipped (no WHALE_ALERT_API_KEY)');
  }
  
  console.log('');
  
  // Test 3: Abyiss provider (if key exists in env)
  if (process.env.ABYISS_API_KEY) {
    console.log('Test 3: Abyiss provider');
    try {
      const result = await fetchWhaleAlerts(['BTC']);
      console.log(`✅ Abyiss returned ${result.length} transactions`);
      if (result.length > 0) {
        console.log(`   First: ${result[0].symbol} $${result[0].usdValue.toFixed(2)}`);
      }
    } catch (e) {
      console.log(`⚠️  Abyiss failed (expected if no key): ${e.message}`);
    }
  } else {
    console.log('Test 3: ⏭️  Skipped (no ABYISS_API_KEY)');
  }
  
  console.log('\n✅ Whale router tests complete!');
  console.log('   Priority: Abyiss → Whale Alert → Mock');
}

testWhaleRouter().catch(console.error);
