/**
 * Quick test script to verify CDP JWT authentication
 */
import 'dotenv/config';
import { CoinbaseJwtClient } from './packages/shared/src/coinbaseJwtClient';

async function test() {
  console.log('Testing CDP JWT authentication...\n');
  
  const apiKey = process.env.COINBASE_API_KEY;
  const apiSecret = process.env.COINBASE_API_SECRET;
  
  console.log('API Key:', apiKey?.substring(0, 60) + '...');
  console.log('Secret starts with:', apiSecret?.substring(0, 30) + '...');
  console.log('Secret ends with:', '...' + apiSecret?.substring(apiSecret.length - 30));
  console.log('');
  
  const client = new CoinbaseJwtClient();
  
  try {
    console.log('Attempting to fetch accounts...');
    const accounts = await client.getAccounts({ limit: 10 });
    console.log('✅ SUCCESS! Got', accounts.accounts.length, 'accounts');
    console.log(JSON.stringify(accounts, null, 2));
  } catch (error: any) {
    console.log('❌ FAILED:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

test();
