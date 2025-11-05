/**
 * Test whale provider router logic
 * Verifies provider priority: Abyiss → Whale Alert → mock
 */

import { fetchWhaleAlerts } from './index';

describe('Whale Provider Router', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use mock data when no API keys are configured', async () => {
    delete process.env.ABYISS_API_KEY;
    delete process.env.WHALE_ALERT_API_KEY;

    const result = await fetchWhaleAlerts(['BTC', 'ETH']);
    
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('mock');
    expect(result[0].symbol).toBe('BTC');
    expect(result[0].usdValue).toBeGreaterThan(0);
  });

  it('should prioritize Abyiss when key is present', async () => {
    process.env.ABYISS_API_KEY = 'test_abyiss_key';
    process.env.WHALE_ALERT_API_KEY = 'test_whale_key';

    // Mock axios to verify Abyiss is attempted first
    const consoleSpy = jest.spyOn(console, 'log');
    
    try {
      await fetchWhaleAlerts(['BTC']);
    } catch (e) {
      // Expected to fail without real API
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Abyiss provider')
    );
  });

  it('should fall back to Whale Alert if Abyiss is not configured', async () => {
    delete process.env.ABYISS_API_KEY;
    process.env.WHALE_ALERT_API_KEY = 'test_whale_key';

    const consoleSpy = jest.spyOn(console, 'log');
    
    try {
      await fetchWhaleAlerts(['BTC']);
    } catch (e) {
      // Expected to fail without real API
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Whale Alert provider')
    );
  });

  it('should return valid WhaleTransaction structure', async () => {
    const result = await fetchWhaleAlerts(['BTC']);
    
    expect(result[0]).toMatchObject({
      symbol: expect.any(String),
      amount: expect.any(Number),
      usdValue: expect.any(Number),
      timestamp: expect.any(String),
      type: expect.stringMatching(/exchange_deposit|exchange_withdrawal|large_transfer/),
      source: expect.any(String),
    });
  });
});
