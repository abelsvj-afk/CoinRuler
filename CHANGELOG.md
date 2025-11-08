# CHANGELOG

All notable changes to this project will be documented in this file.

## 1.0.0 (2025-11-08)


### Features

* add BackBar navigation, Activity page, enhanced BTC collateral display, improved AI chat, and API startup resilience ([f39cdec](https://github.com/abelsvj-afk/CoinRuler/commit/f39cdec104f907280faf5f9e7eba46765d8547b6))
* add production monorepo workspace with complete feature set ([dbc3fc6](https://github.com/abelsvj-afk/CoinRuler/commit/dbc3fc6dd75e1203d9e3c1b0fd94cebafd3ee549))
* Advanced AI/ML trading system with intelligent profit-taking ([1ddbb5f](https://github.com/abelsvj-afk/CoinRuler/commit/1ddbb5ff0625244f47ee9fc2596d97157f1e2d1a))
* **api,cicd:** robust CORS wildcard support (https://*.vercel.app) and add .dockerignore to keep secrets out of build contexts ([26a8e59](https://github.com/abelsvj-afk/CoinRuler/commit/26a8e59006795d019f587470fe9f2c4721b79373))
* **api+web:** 24h price & portfolio change, collateral stats, price analytics endpoint/page, manual snapshot alert ([f21560e](https://github.com/abelsvj-afk/CoinRuler/commit/f21560e062ad20ede48032b304cb54545df5657d))
* **api+web:** add rotation policies listing, backtest summary, coinbase status UI, and live snapshot actions; switch portfolio page to /portfolio/current ([f7f45d9](https://github.com/abelsvj-afk/CoinRuler/commit/f7f45d9ad2ac8c4984459aa68a42ea9815d82dfc))
* **api:** add /version endpoint for deployment verification ([7c0f7d8](https://github.com/abelsvj-afk/CoinRuler/commit/7c0f7d8092d3c1828ec5769ebaa74814ede11cd7))
* **api:** add CORS fallback allowlist and diagnostics for origin resolution ([6f96fb4](https://github.com/abelsvj-afk/CoinRuler/commit/6f96fb45f940097026992cf2c26c756d28f34cbc))
* **api:** add LIGHT_MODE to disable schedulers; add root ping endpoint ([af9d1c8](https://github.com/abelsvj-afk/CoinRuler/commit/af9d1c864e222bd3816bc6d808d9970e47e942bc))
* **api:** add portfolio/current, balances, approvals/pending, analysis/projection, report/daily; CORS multi-origin + /env; disable bot in Procfile; web: add API override input ([27a82fd](https://github.com/abelsvj-afk/CoinRuler/commit/27a82fdbd17e3114702cdae54cce56659ddb4d24))
* **api:** allow coinbase optional (disabled mode when missing keys) ([1c8cdb2](https://github.com/abelsvj-afk/CoinRuler/commit/1c8cdb2805d92e9889a604e4826a172cd249f83c))
* **api:** anomaly detection, mongo self-healing watchdog, and autonomous learning loop ([fd07560](https://github.com/abelsvj-afk/CoinRuler/commit/fd0756099d743c5f1a0b0627986c291698b9648a))
* **api:** automatic initial snapshot + periodic scheduler ([ee7904f](https://github.com/abelsvj-afk/CoinRuler/commit/ee7904fd23f6565b5e167bf4889484a5296cb21c))
* **api:** dynamic risk throttles with auto kill-switch and recovery ([f82d74a](https://github.com/abelsvj-afk/CoinRuler/commit/f82d74a7e2d809b65aa5fa1e5f59eed166d84f9f))
* **api:** optional autonomous execution with risk gates and system approvals ([c4ede28](https://github.com/abelsvj-afk/CoinRuler/commit/c4ede2838e53d00b1457bcac6da0c2cb272d1dd6))
* **api:** volatility-aware snapshot cadence with dynamic interval adjustment ([d243a69](https://github.com/abelsvj-afk/CoinRuler/commit/d243a697633a984c1850defe1d1ed6d7261c526b))
* **bot:** allow Discord token optional (disabled mode when missing), add login retry and error handling ([e490b07](https://github.com/abelsvj-afk/CoinRuler/commit/e490b072a51289509ab565293a47a7425ef26277))
* **coinbase:** add paginated getAccountsPage with limit/cursor support ([9dbb1d0](https://github.com/abelsvj-afk/CoinRuler/commit/9dbb1d0abe5eaaeb5a23312b3bc1080b979dd9ee))
* **coinbase:** advanced trade diagnostics, new endpoints & setup guide; pin node 20.18.0 ([ed3de23](https://github.com/abelsvj-afk/CoinRuler/commit/ed3de23bffb568121522387df252f211d2b19fdd))
* **coinbase:** optional @coinbase/coinbase-sdk integration + /coinbase/wallets endpoint; SDK wallets included in debug ([0b26a6e](https://github.com/abelsvj-afk/CoinRuler/commit/0b26a6efb0ce1eda7188da681b928132b1b30e0d))
* complete all 6 requested features - contrast, polling, knowledge store, ML events, USDC yield, tests ([8c02acf](https://github.com/abelsvj-afk/CoinRuler/commit/8c02acf8f7ec4a6a07f73e7a4187a2da88362154))
* filter portfolio to only show crypto with investment baseline ([b301476](https://github.com/abelsvj-afk/CoinRuler/commit/b301476fdc772b26bb8a134abd113e65c26b9ca5))
* integrate AI chat, MFA, auto profit-taking, collateral protection, endpoints ([c697f72](https://github.com/abelsvj-afk/CoinRuler/commit/c697f72d34253c4ff36da2a72995c93676e46754))
* integrate Coinbase Advanced balances with BTC watcher ([8f2eeef](https://github.com/abelsvj-afk/CoinRuler/commit/8f2eeefc277ad313219d0fe6675ad232e6054735))
* **ops:** env validation, owner auth, SSE client, centralized logger, smoke test, CI and release workflows, docs update ([2912d5d](https://github.com/abelsvj-afk/CoinRuler/commit/2912d5d98e4a078aac3dde8a2e05bd95a53922af))
* **shared:** relax env validation (Mongo optional, default DB name) to prevent hard crash on Railway) ([0d31d75](https://github.com/abelsvj-afk/CoinRuler/commit/0d31d75e61782b5e1bb9a7925444f205d50c6555))
* **web:** add Railway deployment config (Dockerfile, railway.json, deploy guide) ([adf626b](https://github.com/abelsvj-afk/CoinRuler/commit/adf626bfa438980d74d801153d6acb410b8b2fc2))
* **web:** add server-side proxy /api/ruler/[...path] to forward to Railway API and bypass CORS ([5c9712e](https://github.com/abelsvj-afk/CoinRuler/commit/5c9712e21f11d645e8769d9e6fcb33f45f109d77))
* **web:** add XRP StatCard and refresh/live snapshot actions on homepage and portfolio pages ([c572ef0](https://github.com/abelsvj-afk/CoinRuler/commit/c572ef0fba4647b37eecc3d28670e11b5a8a98da))
* **web:** automatic fallback to /api/ruler proxy on direct API fetch failures to bypass CORS and network issues ([24ee139](https://github.com/abelsvj-afk/CoinRuler/commit/24ee139f0b6f80152eee6e2cf7911b4dd70e4583))
* whale provider router with AbyissWhaleAlertMock fallback ([7f1020f](https://github.com/abelsvj-afk/CoinRuler/commit/7f1020f3f71335c982503e0d777d5cacc1d9b7d3))
* whale provider router with AbyissWhaleAlertmock priority ([ba7607e](https://github.com/abelsvj-afk/CoinRuler/commit/ba7607e2a94142fb19f0d959635a39eb1e253e27))
* wire frontend to /portfolio/current with freshness + baselines; add /portfolio/snapshot/force ([ca82528](https://github.com/abelsvj-afk/CoinRuler/commit/ca825280a6df730cde8154e9c62238b9a3c24f19))
* wire homepage SSE client for live updates ([90a1d0f](https://github.com/abelsvj-afk/CoinRuler/commit/90a1d0f548ea66d7b7a22ae5be989e6e7bdd2a8c))
* **workflows:** add n8n-style self-debugger engine and CLI ([4677ae0](https://github.com/abelsvj-afk/CoinRuler/commit/4677ae06a08412ebce43254f6874c81dd6b4618e))


### Bug Fixes

* add .npmrc to resolve Railway build peer deps ([aa07859](https://github.com/abelsvj-afk/CoinRuler/commit/aa07859456c0034cd33f11a02fbe6509f080042f))
* Add missing @coinruler/rules package to build order ([8815fea](https://github.com/abelsvj-afk/CoinRuler/commit/8815feab278cf1aa46b5e239c51fd32b87bae0e1))
* add wagmi and viem peer dependencies for OnchainKit ([346d07d](https://github.com/abelsvj-afk/CoinRuler/commit/346d07d95604717ff1104851882a7babaa1b7927))
* add wagmi and viem peer dependencies for OnchainKit ([213b242](https://github.com/abelsvj-afk/CoinRuler/commit/213b242b205cd2de7d89c2f409aa2c1a5f0f79a7))
* **api:** enable trust proxy, add mycoinruler.xyz to CORS, increase SSE max listeners ([e946007](https://github.com/abelsvj-afk/CoinRuler/commit/e946007cd67a2a2a3cc32b9a6a29c58c0d920929))
* **api:** prefer platform PORT in production to avoid Railway port mismatch; add startup log via=PORT|API_PORT ([cbc1594](https://github.com/abelsvj-afk/CoinRuler/commit/cbc15949f03d250da626d61b80cbc4b9bd8c34fb))
* **auth:** make Discord provider optional to prevent crashes without credentials ([84a1493](https://github.com/abelsvj-afk/CoinRuler/commit/84a149375f16ea25da51976ab6e08de277ef5c94))
* bind API to 0.0.0.0 for container; improve web API base auto-detect ([437ff80](https://github.com/abelsvj-afk/CoinRuler/commit/437ff803f1b5a0da7f2c12bf92bc77a3c861ce0a))
* **deploy:** build TypeScript on Railway before running ([9cea3ac](https://github.com/abelsvj-afk/CoinRuler/commit/9cea3ac51db376be875afa88e2df43344d58d6c7))
* **deploy:** fail-open auth when NEXTAUTH_SECRET missing; robust layout; restore vercel build commands ([5eab8b3](https://github.com/abelsvj-afk/CoinRuler/commit/5eab8b3ec470835aaa286a44be2c9e72579b743a))
* **live updates:** ensure forced snapshot emits portfolio:updated and use proxy-aware apiPost for snapshot buttons ([d23218c](https://github.com/abelsvj-afk/CoinRuler/commit/d23218cb071ef49782adec3d85ce7eff437e4fa6))
* **logger:** avoid recursive child() causing stack overflow on Node 22; wrap pino child properly ([edb9a1b](https://github.com/abelsvj-afk/CoinRuler/commit/edb9a1ba2e1fd68772fb63b6b11038e43b18cddd))
* **middleware:** remove auth wrapper causing build error; keep fail-open logic ([e324500](https://github.com/abelsvj-afk/CoinRuler/commit/e324500c7bc881694c23bac038ce3f0fa86b87cb))
* Resolve MongoDB timeout, Coinbase auth, and startup issues ([a2266c3](https://github.com/abelsvj-afk/CoinRuler/commit/a2266c35ad6652d61016d9e4b206c90ff18d527d))
* show all holdings including locked collateral in portfolio ([b9b1e9b](https://github.com/abelsvj-afk/CoinRuler/commit/b9b1e9bc3f7abd02e846dfc6961bbbaedec0c2a0))
* **vercel:** add vercel.json config and vercelignore to build only web app ([8c94f8e](https://github.com/abelsvj-afk/CoinRuler/commit/8c94f8eea40c7c9cf38d729beb83321fd14702d1))
* **vercel:** simplify next.config and relax .vercelignore to prevent fsPath errors during build ([3b1eec0](https://github.com/abelsvj-afk/CoinRuler/commit/3b1eec00eb6ff80f3bc9b3f92a0ada92dd42bb9f))
* **web,api:** SSE via proxy route + add Coinbase env diagnostics to /env endpoint ([dd8db52](https://github.com/abelsvj-afk/CoinRuler/commit/dd8db5290bc5954dcf489edf7db9f6c92a9842ab))
* **web:** add next-auth dependency for Next.js build ([d6091e7](https://github.com/abelsvj-afk/CoinRuler/commit/d6091e71490c191443e5dbfb73c8ebf0529102e2))
* **web:** improve UX - fix welcome modal opacity, add API connection status, fix non-working buttons, add live SSE status indicator ([7c3b148](https://github.com/abelsvj-afk/CoinRuler/commit/7c3b148aced75b21ee693c90a43f80711c520d79))
* **web:** stabilize Next workspace config; add integration tester and starter script\n\n- Set output: 'standalone' and outputFileTracingRoot to monorepo root\n- Simplify middleware matcher to avoid over-catching\n- Add test-integration script to verify API+Web endpoints\n- Add START_AND_TEST.bat to launch services and run tests ([3db31f1](https://github.com/abelsvj-afk/CoinRuler/commit/3db31f16cd856717cd94846a10da31ab239e2097))
* **web:** update proxy route params to Promise for Next.js 16 compatibility ([a573867](https://github.com/abelsvj-afk/CoinRuler/commit/a573867daa0e58bff5a68d0f114c5729109cb7ec))

## [Unreleased]
- Professionalized project structure: CI, lint, Prettier, CONTRIBUTING, SECURITY, docs
- Modularized execution, ML, sentiment, reporting, notifier, backtest
- Added unit and integration tests for approval flow
- Added feature tracker CLI and timestamped backups
- Added credential rotation guide

## [1.0.0] — Initial Release
- Baseline bot with DRY_RUN, MongoDB, Discord, Express, and Coinbase integration
- Monte Carlo simulation, approval flow, and reporting
