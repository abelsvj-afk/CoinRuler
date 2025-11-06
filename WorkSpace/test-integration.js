/**
 * Integration test: API endpoints and web server connectivity
 * Run with: node test-integration.js
 */

const http = require('http');

function testEndpoint(url, name) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ ${name}: OK (${res.statusCode})`);
          console.log(`   Length: ${data.length} bytes`);
          resolve(true);
        } else {
          console.log(`⚠️  ${name}: Status ${res.statusCode}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.log(`❌ ${name}: ${err.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`❌ ${name}: Timeout`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing API and Web Integration\n');

  // Test API endpoints
  console.log('--- API Endpoints (port 3001) ---');
  await testEndpoint('http://localhost:3001/health', 'API /health');
  await testEndpoint('http://localhost:3001/dashboard', 'API /dashboard');
  await testEndpoint('http://localhost:3001/approvals', 'API /approvals');

  console.log('\n--- Web Server (port 3000) ---');
  await testEndpoint('http://localhost:3000/', 'Web homepage');
  await testEndpoint('http://localhost:3000/dashboard', 'Web /dashboard');
  await testEndpoint('http://localhost:3000/alerts', 'Web /alerts');

  console.log('\n✅ Integration tests complete!');
}

runTests().catch(console.error);
