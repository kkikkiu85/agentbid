# Experiment results (synthetic)

> 40 synthetic buyers · 108 advertiser offers · 3 slots shown · regenerate with `node experiments/run.mjs`

**Synthetic data. Graded by an oracle utility function, not by observed human behaviour. Not a measurement of real CTR, CVR, CPA or incrementality.**

## 1. Strategy comparison

| Strategy | Bits disclosed | Anonymity set | Top-1 true fit | Top-1 actually usable | Unusable offers shown | Paid slots dropped pre-click |
|---|---:|---:|---:|---:|---:|---:|
| A. General targeting | 3.58 | 1 in 4,166,667 | 0 | 0% | 100% | 0 |
| B. Keyword / explicit | 14.49 | 1 in 2,170 | 0.107 | 17.5% | 58% | 0 |
| C. AgentBid | 19.4 | 1 in 72 | 0.631 | 90% | 0% | 0.88 |

## 2. Disclosure sweep — relevance per bit

| Disclosure level | Bits | Anonymity set | Top-1 fit — agent re-ranks | Top-1 fit — marketplace ranks | Fit per extra bit (agent) |
|---|---:|---:|---:|---:|---:|
| L0 category only | 3.58 | 1 in 4,166,667 | 0.035 | 0 | — |
| L1 + destination | 8.91 | 1 in 104,167 | 0.328 | 0.026 | 0.055 |
| L2 + month, style | 14.49 | 1 in 2,170 | 0.609 | 0.107 | 0.0504 |
| L3 + party, budget band | 19.4 | 1 in 72 | 0.631 | 0.468 | 0.0045 |
| L4 + hard requirements | 21.3 | 1 in 22 | 0.635 | 0.473 | 0.0021 |
| L5 + exact budget | 27.94 | 1 in 1 | 0.635 | 0.546 | 0 |

Reference point: about 33 bits uniquely identifies one person on Earth.

**Knee of the curve.** At 14.49 bits the user's agent already reaches 0.609 of the 0.635 achievable at 27.94 bits (95.9% of attainable relevance), while the anonymity-set estimate falls from 1 in 2,170 to 1 in 1. Where the agent does the final ranking, extra disclosure buys little; where the marketplace ranks alone it buys more. On this synthetic market the two are substitutes.

**Equivalence point: none.** A marketplace ranking alone never reaches 0.609 on this market — not even at 27.94 bits, where the anonymity-set estimate is 1 in 1 and the buyer is effectively identified. It tops out at 0.546. The user's agent reaches 0.609 at 14.49 bits. Buying identity is not a substitute for letting the buyer's own agent decide.
