# AgentBid — Research & Positioning Brief

> Team **AgentBid** · Nesa AI Hackathon · 2026-11-26
> Scope note: this brief cites public sources as of Nov 2026. Figures produced by our own
> code are labelled **synthetic**. We make no claim about real-world conversion lift.

---

## 1. The market is no longer hypothetical

The original project memo framed AI-mediated advertising as a *future* assumption. It is
already shipping:

| Date | Event | Why it matters to us |
|---|---|---|
| Oct 2025 | **AdCP (Ad Context Protocol)** launched by a 20+ company consortium, built on top of Anthropic's MCP | There is now a standard language for agent-to-agent ad transactions. AgentBid can speak it instead of inventing one. |
| Feb 9, 2026 | **OpenAI turns on ads inside ChatGPT**; self-serve Ads Manager opens May 5, 2026 | The "AI answer + sponsored unit below it" format is now the incumbent, not the idea. |
| Mar 2026 | AdCP 3.0 RC; repo renamed *Advertising* Context Protocol. Includes a **Trusted Match** layer split into **Context Match** and **Identity Match** | The standard itself has already separated context-based matching from identity-based matching. AgentBid = a Context-Match-only marketplace. |
| Sep 16, 2026 | OpenAI tests **Sponsored Agents** — a labelled brand-run conversation branched off an ad click, which OpenAI describes as distinct from ChatGPT's own answers | Confirms the incumbent's answer: keep the paid channel *beside* the organic answer. AgentBid's thesis is that "beside" is a policy promise, and should be an architectural guarantee. |
| 2026 | Google, Microsoft Copilot and Amazon (Rufus/Alexa for Shopping) all sell ads inside assistants; Perplexity winds its ad program down; Anthropic keeps Claude ad-free | The demand side is consolidating into the model providers. An independent, provider-neutral intent marketplace is the open slot. |

**Consequence for our pitch:** we stop arguing that AI will mediate shopping. We argue about
*how the transaction should be structured* now that it does.

---

## 2. What the research says about advertising to agents

Four findings shape the design.

**(a) Agents read specs, not creative.** Stöckl & Nitu tested GPT-4o / Claude 3.7 Sonnet /
Gemini 2.0 Flash driving hotel-booking flows and found agents weight structured facts —
price, availability, specification — where humans weight visual and emotional cues. Banner
and brand creative loses most of its leverage when the reader is a machine.
→ *Design implication:* the ad unit should be a **machine-readable offer**, not an image.

**(b) Agents actively penalize the word "Sponsored."** Allouah et al. (ACES, a programmable
mock marketplace) found shopping agents systematically discount sponsored tags while
rewarding platform endorsements, and show strong position bias that persists even in
text-only interfaces. They also show a seller-side agent making small description tweaks can
capture meaningful share.
→ *Design implication:* paid placement cannot be laundered into the organic answer, and
advertisers' real lever is **offer quality and data quality**, not placement.

**(c) Labels do not protect humans.** A preregistered experiment on conversational shopping
found an explicit "Sponsored" label plus warning did not significantly reduce persuasion, and
when the model was instructed to hide its persuasive intent, participants detected it less
than 10% of the time.
→ *Design implication:* disclosure-based trust is insufficient. Trust has to come from a
**structural separation the user can inspect**, not from a badge.

**(d) Agent choices are unstable and concentrated.** The same work reports choice homogeneity
(demand piling onto a few "modal" products) and reshuffling across model versions.
→ *Design implication:* an auction over agent attention must be auditable and re-runnable,
or advertisers cannot plan.

Taken together: (b) and (c) are the core tension. **Sponsorship is penalized by machines and
invisible to humans.** Neither party is served by today's label-and-rank model.

---

## 3. The privacy layer that is actually missing

This is the distinction the project hinges on, and it is the one most often collapsed.

**Nesa's layer — confidential inference.** Equivariant Encryption (EE) runs inference on
transformed inputs so the serving node never sees plaintext queries, inputs or intermediate
activations, at close to plaintext latency; HSS-EE splits the encrypted embedding across two
servers so neither holds the whole input. This protects the **model channel**: the inference
provider is blind.

**The layer nobody covers — confidential disclosure.** In an agentic workflow the leak is not
the model. It is the **tool call**. The agent, acting correctly on the user's behalf, hands
context to third parties in order to get work done: a search query, a product API, an ad
request. Encrypting inference does nothing about what the agent chooses to send outward.

> **Confidential inference ≠ confidential disclosure.**
> Nesa makes the model blind. Something has to make the *marketplace* blind.

That something is an **egress control plane at the agent boundary**: a whitelist of fields,
an explicit user grant per request, an entropy budget, and a session that expires. That is
AgentBid's Privacy Gateway, and it is a different problem from cryptographic inference — which
is precisely why the two compose rather than compete.

**Honest boundaries we will state on stage:**
- An ephemeral session ID is not anonymity. Rare attribute combinations, network metadata and
  post-click navigation can still re-identify.
- We implement field-level minimization and report an anonymity-set estimate; we do not prove
  k-anonymity over a real population.
- We do not control tracking after the user leaves for a merchant site.
- Advertiser-supplied offer data is untrusted input (false prices, prompt injection).

---

## 4. Brave as the architectural precedent — and what we invert

Brave Ads is the one privacy-preserving ad system that reached production. Its mechanism:
the ad server pushes a **catalog** of campaigns and targeting parameters to every browser in
a region, and matching runs **on the user's device** via on-device ML, so no
personally-identifiable data goes back to Brave. Brave reports a CTR lift for this model over
conventional ad tech. Brave Research's *PrivateFetch* paper goes further, delivering ad
catalogs under private information retrieval.

What Brave proves: **relevance does not require the server to know the user.**

What Brave cannot do: a pushed catalog is a *fixed* set of pre-written ads. It cannot carry a
**negotiated** response — a quote for your exact trip, a coupon conditioned on your
constraints, a bid for your specific question. Catalog push is one-directional.

**AgentBid inverts the direction.** Instead of pushing all ads to the user, we push a
**minimal, consented, expiring description of the user's intent** to advertisers, and let them
respond competitively — while the final ranking function stays on the user's side, exactly as
in Brave. Advertising stops being targeting and becomes a **reverse auction / RFQ**.

| | Brave Ads | AgentBid |
|---|---|---|
| What moves | Ad catalog → device | Minimal intent → advertisers |
| Matching location | On device | Eligibility on server (blind), **final ranking on device** |
| Offer type | Pre-written creative | Negotiated, per-request offer |
| Signal | Browsing context / keywords | Structured purchase intent from the agent |

---

## 5. The reframe: indirect vs direct exposure, and the axis everyone missed

Advertising splits into **indirect exposure** (display, social, in-feed — bought attention
with no intent present) and **direct exposure** (search, shopping, retail media — bought
intent at the moment of demand). AI agents live entirely on the direct side: nobody browses
past an agent's answer. So an agent-native ad mechanism has to be **solicited**, not
interruptive.

But direct-response advertising has a bandwidth problem nobody names. Search monetizes intent
through a **2–5 word keyword** — a lossy compression of what the buyer actually wants. The
industry's answer to that loss has been to rebuild the missing context from **identity**:
cookies, graphs, profiles, retargeting. Relevance was purchased with surveillance because the
intent signal was too thin to carry it.

An AI agent already holds the high-bandwidth version — budget, constraints, trade-offs,
rejected options, context of the trip. So:

> **Relevance has two independent inputs: identity persistence and intent bandwidth.
> Adtech maxed out the first because it could not access the second. Agents give us the
> second for free.**

| | Low intent bandwidth | High intent bandwidth |
|---|---|---|
| **High identity persistence** | Display / social retargeting | *(Agent platforms with ads + user profiles — the default future)* |
| **Low identity persistence** | Brave Ads, contextual | **AgentBid** |

The bottom-right quadrant is the empty one, and it is the one the research says is both
reachable and necessary.

### 5.1 The metric that makes this measurable

We score disclosure in **bits**. Each disclosed field costs the log₂ of its cardinality;
an anonymity-set estimate falls out of the total. Narayanan's "33 bits of entropy" framing is
the reference point: about 33 bits uniquely identifies one human on Earth.

**Disclosure efficiency = match quality gained per bit disclosed.**

Our synthetic experiment (see `/experiments`) measures exactly this curve, and its interesting
property is the **knee**: match quality saturates while bits keep climbing. If that holds on
real data, the surveillance premium of adtech is buying almost nothing. That is the claim
worth testing, and it is falsifiable.

---

## 6. Positioning in one page

**Problem.** Once an AI agent decides what a consumer sees, advertisers must win the agent's
evaluation, not the human's eyeball. The incumbent answer — a sponsored card beside the AI
answer, backed by a platform profile of the user — reproduces surveillance adtech one layer up,
and the research says its central trust mechanism (the "Sponsored" label) protects nobody.

**Thesis.** Buy **intent**, not **identity**. Advertisers submit machine-readable offers against
a consented, minimal, expiring statement of what the user wants. The paid auction decides
sponsored slots on the server; the user's own agent computes the independent ranking on the
client with the private context the server never receives. Two scores, two locations, one
audit trail.

**Tagline.** *Advertisers compete for intent, not identity.*

**Where Nesa fits.** EE/HSS-EE makes the inference that extracts intent confidential;
AgentBid's gateway makes the disclosure that follows it minimal. Full stack: blind model +
blind marketplace.

**What the hackathon proves.** The mechanism runs end-to-end and is inspectable: you can watch
the exact bytes leave, move the privacy dial and watch bits/match-quality/anonymity trade off,
raise an advertiser's bid and watch the sponsored slot change *without* the organic
recommendation changing.

**What it does not prove.** Real CTR/CVR/CPA, incrementality, advertiser profitability,
adoption by any third-party AI platform, or cryptographic anonymity.

---

## Sources

- Nesa, *Practical Approach: Equivariant Encryption* — https://docs.nesa.ai/nesa/major-innovations/private-inference-for-ai/practical-approach-equivariant-encryption-ee
- Nesa, *Scalable Private Inference with HSS-EE* — https://docs.nesa.ai/nesa/major-innovations/private-inference-for-ai/scalable-private-inference-with-hss-ee
- *Encrypted Large Model Inference: The Equivariant Encryption Paradigm*, arXiv:2502.01013
- Brave, *An Introduction to Brave's In-Browser Ads* — https://brave.com/blog/intro-to-brave-ads/
- Brave Ads Help, *Ad targeting* — https://ads-help.brave.com/campaign-performance/targeting/
- *PrivateFetch: Scalable Catalog Delivery in Privacy-Preserving Advertising*, arXiv:2109.08189
- Ad Context Protocol — https://github.com/adcontextprotocol/adcp · https://docs.adcontextprotocol.org
- Adweek / Digiday / PPC Land coverage of the AdCP launch and 3.0 release candidate
- Stöckl & Nitu, *Are AI Agents interacting with Online Ads?*, arXiv:2504.07112
- Nitu et al., *Machine-Readable Ads*, arXiv:2507.12844
- Allouah, Besbes, Figueroa, Kanoria & Kumar, *What Is Your AI Agent Buying?*, arXiv:2508.02630
- *Commercial influence in conversational shopping agents*, arXiv:2604.04263
- OpenAI ChatGPT Ads / Sponsored Agents coverage (Sep 16, 2026); A. Narayanan, "33 bits of entropy"
