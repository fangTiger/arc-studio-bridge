/**
 * App header: title + ConnectKit wallet button.
 */
import { ConnectKitButton } from 'connectkit'
import { NetworkArbitrumOne } from '@web3icons/react'
import { ArrowRight } from 'lucide-react'

export function Header() {
  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between px-5 py-4"
      style={{
        background: 'rgba(13, 27, 47, 0.85)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2">
        <NetworkArbitrumOne variant="branded" size={22} />
        <ArrowRight className="size-4" style={{ color: 'var(--subtle)' }} />
        <div className="size-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'var(--accent)', color: '#0d1b2f' }}>A</div>
        <span className="display text-sm font-semibold ml-1" style={{ color: 'var(--ink)' }}>USDC Bridge</span>
      </div>
      <ConnectKitButton />
    </header>
  )
}
