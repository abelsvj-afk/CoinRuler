require('dotenv').config({ path: './apps/api/.env' });
const { getCoinbaseApiClient } = require('./WorkSpace/packages/shared/dist/coinbaseApi');

async function testCoinbase() {
  console.log('🧪 Testing Coinbase Integration...\n');
  
  const client = getCoinbaseApiClient();
  
  console.log('1. Checking API credentials...');
  console.log(`   API Key: ${process.env.COINBASE_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   API Secret: ${process.env.COINBASE_API_SECRET ? '✅ Configured' : '❌ Missing'}`);
  console.log('');
  
  console.log('2. Testing connection...');
  try {
    const isConnected = await client.testConnection();
    console.log(`   Connection: ${isConnected ? '✅ Success' : '❌ Failed'}`);
    
    if (isConnected) {
      console.log('\n3. Fetching balances...');
      const balances = await client.getAllBalances();
      console.log('   Balances:', JSON.stringify(balances, null, 2));
      
      console.log('\n4. Fetching spot prices...');
      const currencies = Object.keys(balances);
      if (currencies.length > 0) {
        const prices = await client.getSpotPrices(currencies);
        console.log('   Prices:', JSON.stringify(prices, null, 2));
        
        console.log('\n5. Calculating portfolio value...');
        let totalValue = 0;
        for (const [currency, amount] of Object.entries(balances)) {
          const value = amount * (prices[currency] || 0);
          totalValue += value;
          console.log(`   ${currency}: ${amount} × $${prices[currency]} = $${value.toFixed(2)}`);
        }
        console.log(`\n   Total Portfolio Value: $${totalValue.toFixed(2)}`);
      }
    }
  } catch (err) {
    console.error('   Error:', err.message);
    console.error('\n   Full error:', err);
  }
}

testCoinbase().catch(console.error);
