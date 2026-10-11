# Arbitrum → Arc USDC Bridge

A minimal single-page app that bridges USDC from **Arbitrum One to Arc mainnet**, built with [Arc Studio](https://studio.arc.io).

## How it works

- Uses the Circle App Kit Bridge SDK (`@circle-fin/app-kit`) on top of CCTP. No custom contracts.
- The user signs `approve` and `burn` on Arbitrum with their browser wallet.
- `useForwarder: true`: Circle's Forwarding Service fetches the attestation and submits the mint on Arc, so the user needs **no balance on Arc**. The forwarding fee is deducted from the amount received.
- Shows a fee estimate (`kit.estimateBridge`) before bridging, a step tracker (approve → burn → attestation → mint) with explorer links, and a retry button if a step fails.
- The last burn is saved in `localStorage`, so its status survives a page refresh. Once the burn succeeds, funds arrive on Arc even if the page is closed.

## Run locally

Requires [Bun](https://bun.sh).

```bash
bun install
bun run dev
```

## Safety

This moves real USDC on mainnet. Start with a small amount, and review the code before using it with larger transfers.
