# Peak Rider

[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/c/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/xeraaGH/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/c/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/xeraaGH/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/c/btc-race-24h-20261123-0511)

A long-only cbBTC/USDC trading bot for the make.fun "Race a BTC trading bot live for 24 hours" competition. It speaks `agent-fun/bars-replay/v1`: one `hello`, then one reply with `orders` per 1-minute `bar` batch.

## Strategy

Buy the full $1,000 cash balance on the first tradeable bar, then ride the position with a trailing stop 250 bps below the highest close since entry. A stop-out exits everything; the bot only re-enters when the close makes a new high above the stop-out peak.

Why: on the 24h dev window BTC grinds up +364 bps while 1-minute moves are tiny (99th percentile ~26 bps) and a full-size round trip costs ~26–35 bps, so every short-horizon signal whipsaws itself to death — the kit's EMA-cross baseline loses −11.5% on dev with 76 trades. The only dev-positive shapes are "buy early and hold". This bot holds like buy-and-hold, and the trailing stop is crash insurance for the unseen race window: on dev it never fires (max drawdown 1.98% < 2.50%), on the time-reversed dev window it caps the loss at −$19.11 instead of buy-and-hold's −$38.38.

## Dev grade (local, process driver)

- Net PnL: +$32.17 (+3.22%), max drawdown 1.98%, 1 trade, 2x-fee PnL +$31.34
- Split halves: first half +$29.73, second half +$4.22

## Run

`main.ts` (Node 22, erasable TypeScript, standard library only plus the vendored shim under `vendor/`) is the entrypoint; the harness runs `node /bot/main.ts` and speaks NDJSON on stdin/stdout. Deterministic: no clock, no network, no randomness.
