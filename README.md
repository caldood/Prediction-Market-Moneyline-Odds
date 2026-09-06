# ODDS|CALC — Moneyline Probability Engine

A single-page, dependency-free calculator for people who move between sportsbooks
and prediction markets. Type a line in any format and get it back in every other
format, with the bookmaker's margin stripped out and a Kelly-sized bet against a
market price.

Open `index.html` in a browser, or run `npm start` for a local server.

## What it does

- **Any format in, every format out.** Enter American odds, decimal odds, a win
  probability, or a contract price (`0.62`, `62¢`, `62%` all work). The panel
  shows American, decimal, fractional, and the equivalent prediction-market price.
- **No-vig fair line.** A single line is de-vigged with an assumed book vig
  (default 4.76%, a -110/-110 market). Enter both sides of a market to measure
  the real overround and vig, then load a side into the calculator with one click.
- **Edge calculator.** Compare the fair probability to a market's YES price. It
  reports the edge in points, expected return per dollar, and the full-Kelly
  fraction, and tells you whether the value is on YES or NO.
- **Stake-aware payouts.** Set a stake to see sportsbook returns or how many
  contracts it buys and what they pay.
- **Shareable state.** Every input is encoded in the URL hash. Copy Link hands
  you a URL that restores the exact setup.

Sliders and arrow keys never land on invalid odds: the scale jumps straight from
-101 to +100. Shift with an arrow key steps five times faster.

## Formulas

| Quantity | Formula |
|---|---|
| Implied probability, positive odds | `100 / (odds + 100)` |
| Implied probability, negative odds | `|odds| / (|odds| + 100)` |
| Decimal odds | `1 / p` |
| Fair probability, two-sided | `p_raw / Σ p_all` (proportional method) |
| Fair probability, one-sided | `p_raw / (1 + vig)` |
| Book vig | `Σ p_implied − 1` |
| Kelly on YES | `(p_fair − price) / (1 − price)` |
| Kelly on NO | `(price − p_fair) / price` |

## Development

All math and parsing lives in `odds.js`, which loads as a plain script in the
page and as a CommonJS module in Node. `index.html` holds the UI.

```
npm test
```

runs the unit tests with Node's built-in test runner. No packages are installed.
