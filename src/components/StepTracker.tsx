/**
 * Step tracker: displays each CCTP step with its current state and explorer links.
 */
import { CheckCircle2, Loader2, XCircle, Clock, ExternalLink, RefreshCw } from 'lucide-react'
import type { BridgeStep } from './BridgeCard'

const STEP_LABELS: Record<BridgeStep['name'], string> = {
  approve: 'Approve USDC',
  burn: 'Burn on Arbitrum',
  fetchAttestation: 'Circle Attestation',
  mint: 'Mint on Arc',
}

const STEP_DESCRIPTIONS: Record<BridgeStep['name'], string> = {
  approve: 'Grants the CCTP contract permission to spend your USDC.',
  burn: 'Destroys USDC on Arbitrum. After this step your funds are safe even if you close the page.',
  fetchAttestation: 'Circle signs the burn proof (fast mode: ~8–20 seconds).',
  mint: 'Circle Forwarding Service mints USDC on Arc — no gas needed on your side.',
}

function StepIcon({ state }: { state: BridgeStep['state'] }) {
  switch (state) {
    case 'success':
      return <CheckCircle2 className="size-5 shrink-0" style={{ color: 'var(--success)' }} />
    case 'pending':
      return <Loader2 className="size-5 shrink-0 animate-spin" style={{ color: 'var(--accent)' }} />
    case 'error':
      return <XCircle className="size-5 shrink-0" style={{ color: 'var(--danger)' }} />
    default:
      return <Clock className="size-5 shrink-0 opacity-30" style={{ color: 'var(--muted)' }} />
  }
}

interface StepTrackerProps {
  steps: BridgeStep[]
  bridgeSuccess: boolean
  burnDone: boolean
  bridgeError: string | null
  recipient: string
  onRetry?: () => void
  retrying: boolean
}

export function StepTracker({
  steps,
  bridgeSuccess,
  burnDone,
  bridgeError,
  recipient,
  onRetry,
  retrying,
}: StepTrackerProps) {
  return (
    <div
      className="rounded-3xl p-5 flex flex-col gap-4"
      style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
    >
      <h2 className="display text-sm font-semibold" style={{ color: 'var(--ink)' }}>Bridge Progress</h2>

      <ol className="flex flex-col gap-3">
        {steps.map((step) => (
          <li key={step.name} className="flex items-start gap-3">
            <StepIcon state={step.state} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-sm font-semibold"
                  style={{ color: step.state === 'idle' ? 'var(--subtle)' : step.state === 'error' ? 'var(--danger)' : 'var(--ink-2)' }}
                >
                  {STEP_LABELS[step.name]}
                </span>
                {step.explorerUrl && step.state === 'success' && (
                  <a
                    href={step.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs shrink-0"
                    style={{ color: 'var(--accent)' }}
                  >
                    Explorer <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              <p className="text-xs mt-0.5 text-pretty" style={{ color: 'var(--subtle)' }}>
                {STEP_DESCRIPTIONS[step.name]}
              </p>
              {step.error && (
                <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{step.error}</p>
              )}
              {step.txHash && !step.explorerUrl && (
                <p className="mono text-xs mt-1 truncate" style={{ color: 'var(--muted)' }}>
                  {step.txHash.slice(0, 16)}…{step.txHash.slice(-8)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* Burn-done info: safe to close */}
      {burnDone && !bridgeSuccess && (
        <div
          className="rounded-xl px-3 py-2.5 text-xs flex items-start gap-2"
          style={{ background: 'rgba(141,216,159,0.1)', border: '1px solid rgba(141,216,159,0.25)', color: 'var(--success)' }}
        >
          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
          <span className="text-pretty">
            Burn confirmed. Your USDC is locked — it will arrive on Arc automatically even if you close this page.
          </span>
        </div>
      )}

      {/* Success */}
      {bridgeSuccess && (
        <div
          className="rounded-xl px-3 py-2.5 text-xs flex items-start gap-2"
          style={{ background: 'rgba(141,216,159,0.12)', border: '1px solid rgba(141,216,159,0.3)', color: 'var(--success)' }}
        >
          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
          <span className="text-pretty font-medium">
            Bridge complete! USDC has arrived at{' '}
            <span className="mono">{recipient.slice(0, 10)}…{recipient.slice(-6)}</span>{' '}
            on Arc.
          </span>
        </div>
      )}

      {/* Error + Retry */}
      {bridgeError && (
        <div className="flex flex-col gap-2">
          <div
            className="rounded-xl px-3 py-2.5 text-xs"
            style={{ background: 'rgba(232,109,122,0.1)', border: '1px solid rgba(232,109,122,0.25)', color: 'var(--danger)' }}
          >
            {bridgeError}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="w-full rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
            >
              {retrying
                ? <><Loader2 className="size-4 animate-spin" /> Retrying…</>
                : <><RefreshCw className="size-4" /> Retry from failed step</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
