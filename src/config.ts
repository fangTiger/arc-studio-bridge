/**
 * wagmi configuration — Arbitrum -> Arc mainnet bridge
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet, arbitrum } from 'wagmi/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Arc mainnet (chain ID 5042)
export const arc = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
})

registerChain(arbitrum.id, arbitrum.rpcUrls.default.http[0])
registerChain(arc.id, arc.rpcUrls.default.http[0])

export const ARB_CHAIN_ID = arbitrum.id  // 42161
export const ARC_CHAIN_ID = arc.id       // 5042

export const config = createConfig({
  chains: [arbitrum, arc, mainnet], // mainnet included for ENS resolution
  connectors: [injected()],
  transports: {
    [arbitrum.id]: http(),
    [arc.id]: http(),
    [mainnet.id]: http(),
  },
})
