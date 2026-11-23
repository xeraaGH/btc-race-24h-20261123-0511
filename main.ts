// Peak Rider: a long-only cbBTC/USDC bot for agent-fun/bars-replay/v1.
//
// Strategy (2 parameters, deliberately few so the race window cannot be
// curve-fit away): buy the full cash balance on the first tradeable bar,
// then ride the position with a trailing stop 250 bps below the highest
// close seen since entry. A stop-out exits everything; the bot only
// re-enters when the close makes a new high above the stop-out peak, i.e.
// only once the market has proven the downtrend over.
//
// Why this shape: on the 24h dev window the price grinds up +364 bps with
// 1-minute moves whose 99th percentile is only ~26 bps, while a full-size
// round trip costs ~26-35 bps (4 bps fee + 2 bps slippage + ~11 bps impact
// per leg against ~$870k of pool depth). Any signal that trades on
// short-horizon moves whipsaws itself to death (the kit's EMA-cross
// baseline loses -11.5% on dev with 76 trades; momentum variants lose
// too). The only dev-positive shapes are "buy early and hold": buy-and-hold
// makes +$32.17 with 1 trade. So this bot holds like buy-and-hold, and the
// trailing stop is pure crash insurance for the unseen race window: on dev
// it never fires (max drawdown 1.98% < 2.50%), so dev PnL equals
// buy-and-hold; on the time-reversed dev window (a -364 bps downtrend) it
// caps the loss at -$19.11 instead of buy-and-hold's -$38.38; on 300
// driftless block-bootstrap windows it truncates the worst decile from
// -$39.21 to -$29.90. Re-entry on a new high lets it rejoin a recovery
// instead of sitting in cash for the rest of the day.
//
// Determinism: no clock, no network, no randomness; every decision is a
// function of the bars seen so far. Two runs on the same data produce
// byte-identical replies.

import { BPS, runBars, type BarsState, type BuyInput, type OrderInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Trailing stop: exit when the close falls this far below the peak close since entry (basis points). */
const TRAIL_BPS = 250;
/** Slippage bound on every order; 1-minute moves are ~26 bps at the 99th percentile, so 100 bps never binds. */
const MAX_SLIPPAGE_BPS = 100;

/** Highest close (raw price units) seen while holding, or null when flat. */
let peak: bigint | null = null;
/** Peak close at the last stop-out; re-entry needs a close above this. Null until the first stop-out. */
let stopPeak: bigint | null = null;
/** Whether a buy order has been sent and not yet known-rejected. */
let buySent = false;

await runBars({
  onBatch(state: BarsState, batch) {
    // A batch carries one bar per symbol; the orders decided on it fill at
    // the next bar's open, so everything below is decided on this bar's close.
    // First, learn from the fills this batch reports: a rejected buy must
    // not strand the bot in cash for the rest of the day, so clear the
    // sent-flag and let the next bar retry the entry.
    for (const fill of batch.fills) {
      if (fill.status === 'rejected' && fill.side === 'buy' && !state.positions.has(fill.symbol)) {
        buySent = false;
        peak = null;
      }
    }
    if (state.warmingUp) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];

    const held = state.positions.get(SYMBOL);
    const orders: OrderInput[] = [];

    if (held === undefined || held.qty === 0n) {
      // Flat: enter on the first tradeable bar, or after a stop-out once the
      // close prints a new high above the stop-out peak.
      const freshStart = peak === null && stopPeak === null && !buySent;
      const reentry = stopPeak !== null && close > stopPeak;
      if (freshStart || reentry) {
        const { caps, fees } = state.hello;
        const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
        const amount = state.cash < byWeight ? state.cash : byWeight;
        if (amount >= BigInt(fees.min_notional_quote_units)) {
          const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS };
          orders.push(buy);
          buySent = true;
          peak = close;
        }
      }
      return orders;
    }

    // Holding: raise the trailing peak, and exit on a 250 bps pullback.
    if (peak === null || close > peak) peak = close;
    if (close * 10_000n < peak * BigInt(10_000 - TRAIL_BPS)) {
      const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
      orders.push(sell);
      stopPeak = peak;
      peak = null;
      buySent = false;
    }
    return orders;
  },
});
