# Ultimate Crypto Advisor Bot — Master Checklist Summary
This bot must:  
• Connect to Coinbase API (prices, balances, trades, staking for non-core assets, loan & collateral awareness).  
• Use MongoDB as persistent memory for baselines, deposits, approvals, trades, collateral, news sentiment, reinforcement learning data, and strategy logs.  
• Run a Discord interface with commands (/status, /advice, /approve, /decline, /deposit, /panic) for approvals and reports.  
• Host Express web endpoints (/health, /webhook/deposit, /webhook/collateral, /report/daily).  
• Protect and grow BTC and XRP baselines (BTC as digital gold collateral, XRP minimum 10 tokens always). Profit is taken only above baseline.  
• Execute BTC/XRP rule-chain: +15 % sell 15 %, −10 % rebuy 100 %, −25 % sell 10 %; max 10 runs, ≥3 h apart (start 2025-04-11 12:38 ET).  
• Apply position sizing and profit tiers (10→5 %, 20→10 %, 30→15 %, 50→20 %), respect risk caps and throttles.  
• Never stake BTC or XRP; stake non-core assets only after explicit approval and APY/lockup/liquidity evaluation.  
• Require user approval for any new coin purchase or high-risk action; present rationale and risk summary.  
• Track loans and collateral (btc_locked, ltv, health); never sell locked BTC; alert if LTV deteriorates.  
• Perform market analysis with EMA, volatility, momentum, credible news & social sentiment, on-chain signals, and macro data.  
• Run Monte Carlo simulations (≥1000 trials) and ML models (LSTM/ARIMA trend, volatility forecast, reinforcement learning for threshold tuning).  
• Operate in DRY_RUN by default; support kill-switch /panic, rate limits, MFA for large trades, anomaly detection, and secure key storage.  
• Auto-update baselines on deposits (webhook or command); record all state changes to MongoDB.  
• Generate daily/weekly portfolio and P/L reports; send alerts for profits, risks, staking opportunities, and explanations of decisions.  
• Provide dashboard-ready JSON data (portfolio history, Monte Carlo results, ML confidence, approvals queue).  
• Continuously learn from performance data and user feedback to improve recommendations autonomously while preserving safety rules.  
• Honor security and privacy: no key exposure, IP-restricted Mongo, rotated tokens, two-factor approval for critical actions.
