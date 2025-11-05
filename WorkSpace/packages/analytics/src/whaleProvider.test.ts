/**
 * Whale Provider Router Tests
 * Validates provider priority: Abyiss → Whale Alert → Mock
 */

import { fetchWhaleAlerts } from './index';

describe('Whale Provider Router', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.ABYISS_API_KEY;
    delete process.env.WHALE_ALERT_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should use mock provider when no API keys configured', async () => {
    const result = await fetchWhaleAlerts(['BTC', 'ETH']);
    
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('mock');
    expect(result[0].symbol).toBe('BTC');
    expect(result[1].symbol).toBe('ETH');
    expect(result[0].usdValue).toBeGreaterThanOrEqual(500000);
  });

  test('should prioritize Abyiss when ABYISS_API_KEY is set', async () => {
    process.env.ABYISS_API_KEY = 'test_abyiss_key';
    process.env.WHALE_ALERT_API_KEY = 'test_whale_alert_key';
    
    // This will fail to connect but we can verify the priority by checking logs
    // In a real test, we'd mock the axios calls
    const consoleSpy = jest.spyOn(console, 'log');
    
    try {
      await fetchWhaleAlerts(['BTC']);
    } catch (e) {
      // Expected to fail since it's a fake key
    }
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Abyiss provider')
    );
    
    consoleSpy.mockRestore();
  });

  test('should fallback to Whale Alert when Abyiss fails', async () => {
    process.env.WHALE_ALERT_API_KEY = 'test_whale_alert_key';
    
    const consoleSpy = jest.spyOn(console, 'log');
    
    try {
      await fetchWhaleAlerts(['BTC']);
    } catch (e) {
      // Expected to fail
    }
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Whale Alert provider')
    );
    
    consoleSpy.mockRestore();
  });

  test('mock data should have required fields', async () => {
    const result = await fetchWhaleAlerts(['XRP']);
    
    expect(result[0]).toMatchObject({
      symbol: 'XRP',
      amount: expect.any(Number),
      usdValue: expect.any(Number),
      timestamp: expect.any(String),
      type: expect.any(String),
      source: 'mock',
    });
  });
});
