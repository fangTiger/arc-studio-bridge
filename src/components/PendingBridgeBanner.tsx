/**
 * Persistent banner shown on page load when a previous burn txHash is stored.
 */
import { ExternalLink, X, Clock } from 'lucide-react'

export interface PersistedBridge {
  burnTxHash: string
  amount: string
  recipient: string
  timestamp: number
  /** Pre-computed age label — set when the record is created (outside render). */
  ageLabel?: string
}

interface Props {
  record: PersistedBridge
  arbExplorerBase: string
  onDismiss: () => void
}

export function PendingBridgeBanner({ record, arbExplorerBase, onDismiss }: Props) {
  return (
    <div
      className="rounded-2xl p-4 flex items-start gap-3"
      style={{ background: 'rgba(172,198,233,0.1)', border: '1px solid rgba(172,198,233,0.25)' }}
    >
      <Clock className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
          Previous bridge: {record.amount} USDC{record.ageLabel ? ` — ${record.ageLabel}` : ''}
        </p>
        <p className="mono text-xs mt-0.5 truncate" style={{ color: 'var(--subtle)' }}>
          Burn tx: {record.burnTxHash.slice(0, 14)}…{record.burnTxHash.slice(-8)}
        </p>
        <p className="mono text-xs mt-0.5 truncate" style={{ color: 'var(--subtle)' }}>
          To: {record.recipient.slice(0, 10)}…{record.recipient.slice(-6)}
        </p>
        <a
          href={`${arbExplorerBase}/tx/${record.burnTxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs mt-1.5 underline"
          style={{ color: 'var(--accent)' }}
        >
          View burn tx on Arbiscan <ExternalLink className="size-3" />
        </a>
      </div>
      <button onClick={onDismiss} className="shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors">
        <X className="size-4" style={{ color: 'var(--subtle)' }} />
      </button>
    </div>
  )
}
