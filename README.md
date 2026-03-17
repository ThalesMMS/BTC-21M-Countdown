# 21M Countdown

A single-page countdown that projects when Bitcoin reaches its final reward-bearing block. It pulls recent chain data from mempool.space, computes issuance directly from the protocol schedule, and estimates when the last 1 sat block reward will be mined using a fixed 10-minute block interval.

## What It Tracks
- The final reward-bearing block at height `6,929,999`.
- Remaining blocks and BTC left to mine until issuance effectively ends.
- Current mining reward and total BTC issued so far.
- A live countdown using a fixed 10-minute block cadence.

## Protocol Notes
- Bitcoin does not mint a literal final whole bitcoin.
- Due to reward rounding, total issuance tops out at `20,999,999.9769 BTC`, not exactly `21,000,000 BTC`.
- The final mining reward is `1 sat`, and the common high-level estimate for that block is around the year `2140`.

## Development
1. Install dependencies: `npm install`
2. Compile TypeScript: `npm run build`

If you open `index.html` directly, run the build first so `script.js` exists.

## Data Source
- mempool.space API (`/api/blocks` and `/api/blocks/tip/height` as a fallback)

## Disclaimer
This is still a projection. Block intervals are probabilistic, difficulty adjusts over time, and any date shown is an estimate rather than a protocol guarantee.

## License
MIT License. See `LICENSE`.
