/**
 * Main bridge form card: chain selector display, amount input, recipient, estimate, and bridge CTA.
 * Arbitrum mainnet -> Arc mainnet, USDC only, via Circle CCTP (App Kit).
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useReadContract, useBalance, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress, zeroAddress, type EIP1193Provider } from 'viem'
import { AppKit, BridgeChain } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { BridgeResult } from '@circle-fin/app-kit'
import {
  ArrowRight, AlertTriangle, Loader2, CheckCircle2,
  XCircle, Info, ShieldAlert,
} from 'lucide-react'
import { NetworkArbitrumOne, TokenUSDC } from '@web3icons/react'
import { getUsdc, requireChain } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARB_CHAIN_ID, ARC_CHAIN_ID } from '@/config'
import { StepTracker } from './StepTracker'
import { PendingBridgeBanner } from './PendingBridgeBanner'
import type { PersistedBridge } from './PendingBridgeBanner'

// ─── Kit singleton (no kit key needed for bridge) ────────────────────────────
const kit = new AppKit()

// Use typed BridgeChain enum values — no runtime resolution needed, no guessing
const SRC_CHAIN = BridgeChain.Arbitrum
const DST_CHAIN = BridgeChain.Arc

// ─── localStorage key ────────────────────────────────────────────────────────
const LS_KEY = 'arc_bridge_last'

// ─── Step type ───────────────────────────────────────────────────────────────
export type BridgeStep = {
  name: 'approve' | 'burn' | 'fetchAttestation' | 'mint'
  state: 'idle' | 'pending' | 'success' | 'error'
  txHash?: string
  explorerUrl?: string
  error?: string
}

const INITIAL_STEPS: BridgeStep[] = [
  { name: 'approve', state: 'idle' },
  { name: 'burn', state: 'idle' },
  { name: 'fetchAttestation', state: 'idle' },
  { name: 'mint', state: 'idle' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute a human-readable age label. Called from event handlers, never during render. */
function makeAgeLabel(timestamp: number): string {
  const age = Math.round((Date.now() - timestamp) / 60_000)
  return age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`
}

function formatUsdcAmount(raw: bigint | undefined, chainId: number): string {
  if (raw === undefined) return '—'
  try {
    return Amount.fromRaw(raw, usdcDecimalsFor(chainId)).toFixed(2)
  } catch {
    return '—'
  }
}

function readLocalBridge(): PersistedBridge | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedBridge
  } catch {
    return null
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BridgeCard() {
  const { address, connector, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const arbUsdc = getUsdc(ARB_CHAIN_ID)
  const arbChainInfo = requireChain(ARB_CHAIN_ID)

  // USDC balance on Arbitrum
  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: arbUsdc?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARB_CHAIN_ID,
    query: { enabled: !!address && !!arbUsdc },
  })

  // ETH balance on Arbitrum (gas)
  const { data: ethBalance } = useBalance({
    address,
    chainId: ARB_CHAIN_ID,
    query: { enabled: !!address },
  })

  // Low-gas warning threshold: < 0.001 ETH
  const LOW_ETH = 1_000_000_000_000_000n // 0.001 ETH in wei
  const isLowGas = ethBalance !== undefined && ethBalance.value < LOW_ETH

  // Form state — recipient initialised from address only once
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState(address ?? '')
  const [understood, setUnderstood] = useState(false)

  // Sync recipient to connected address when address first becomes available
  const recipientSetRef = useRef(false)
  useEffect(() => {
    if (address && !recipientSetRef.current) {
      setRecipient(address)
      recipientSetRef.current = true
    }
  }, [address])

  // Bridge state
  const [bridging, setBridging] = useState(false)
  const [steps, setSteps] = useState<BridgeStep[]>(INITIAL_STEPS)
  const [bridgeError, setBridgeError] = useState<string | null>(null)
  const [bridgeSuccess, setBridgeSuccess] = useState(false)
  const [burnDone, setBurnDone] = useState(false)
  // Track whether a retryable result exists (avoid reading ref during render)
  const [canRetry, setCanRetry] = useState(false)
  const lastResultRef = useRef<BridgeResult<string> | null>(null)

  // Estimate state
  const [estimating, setEstimating] = useState(false)
  const [estimate, setEstimate] = useState<{ fee: string; received: string } | null>(null)
  const [estimateError, setEstimateError] = useState<string | null>(null)

  // Persisted bridge — init from localStorage during first render
  const [pending, setPending] = useState<PersistedBridge | null>(() => readLocalBridge())

  // ── Validation ──────────────────────────────────────────────────────────────
  const parsedAmount = (() => {
    const n = parseFloat(amount)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const usdcBalanceFormatted = formatUsdcAmount(usdcBalance, ARB_CHAIN_ID)
  const usdcBalanceNum = usdcBalance !== undefined
    ? parseFloat(Amount.fromRaw(usdcBalance, usdcDecimalsFor(ARB_CHAIN_ID)).toFixed(6))
    : null

  const amountError = (() => {
    if (!amount) return null
    if (parsedAmount === null) return 'Enter a valid amount'
    if (usdcBalanceNum !== null && parsedAmount > usdcBalanceNum) return 'Exceeds your USDC balance'
    return null
  })()

  const recipientError = (() => {
    if (!recipient) return null
    if (!isAddress(recipient)) return 'Not a valid address'
    if (recipient === zeroAddress) return 'Cannot send to the zero address'
    return null
  })()

  const onWrongChain = !!address && walletChainId !== ARB_CHAIN_ID
  const canEstimate = !!address && !!parsedAmount && !amountError && isAddress(recipient) && recipient !== zeroAddress
  const canBridge = canEstimate && understood && !bridging && !!estimate

  // ── Estimate ────────────────────────────────────────────────────────────────
  const runEstimate = useCallback(async () => {
    if (!canEstimate || !connector) return
    setEstimating(true)
    setEstimateError(null)
    setEstimate(null)
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter = await createViemAdapterFromProvider({ provider })
      const result = await kit.estimateBridge({
        from: { adapter, chain: SRC_CHAIN },
        to: { chain: DST_CHAIN, recipientAddress: recipient, useForwarder: true },
        amount,
      })
      // SDK returns EstimateResult — extract fee and received amounts
      const r = result as {
        fees?: { total?: string }
        fee?: string
        estimatedFee?: string
        estimatedAmount?: string
        toAmount?: string
        toAmountMin?: string
      }
      const fee = r.fees?.total ?? r.fee ?? r.estimatedFee ?? '0'
      const received = r.estimatedAmount ?? r.toAmount ?? r.toAmountMin
        ?? String(Math.max(0, parseFloat(amount) - parseFloat(String(fee))))
      setEstimate({ fee: String(fee), received: String(received) })
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : 'Estimation failed')
    } finally {
      setEstimating(false)
    }
  }, [canEstimate, connector, amount, recipient])

  // Re-estimate when amount/recipient changes (debounced, clear immediately)
  const estimateKeyRef = useRef('')
  useEffect(() => {
    const key = `${amount}|${recipient}`
    if (estimateKeyRef.current === key) return
    estimateKeyRef.current = key
    setEstimate(null)
    setEstimateError(null)
    if (!canEstimate) return
    const timer = setTimeout(() => { void runEstimate() }, 600)
    return () => clearTimeout(timer)
  }, [amount, recipient, canEstimate, runEstimate])

  // ── Step updater ────────────────────────────────────────────────────────────
  const setStep = useCallback((name: BridgeStep['name'], patch: Partial<BridgeStep>) => {
    setSteps((prev) => prev.map((s) => s.name === name ? { ...s, ...patch } : s))
  }, [])

  // ── Bridge ──────────────────────────────────────────────────────────────────
  const handleBridge = useCallback(async () => {
    if (!connector || !address) return

    setBridging(true)
    setBridgeError(null)
    setBridgeSuccess(false)
    setBurnDone(false)
    setCanRetry(false)
    setSteps(INITIAL_STEPS)
    lastResultRef.current = null

    try {
      // 1. Switch to Arbitrum if needed
      if (walletChainId !== ARB_CHAIN_ID) {
        await switchChainAsync({ chainId: ARB_CHAIN_ID })
      }

      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter = await createViemAdapterFromProvider({ provider })

      // 2. Subscribe to step events (App Kit uses "bridge.*" prefix)
      kit.on('bridge.approve', (payload) => {
        if (payload.protocol === 'cctp') {
          setStep('approve', {
            state: payload.values.state === 'success' ? 'success' : 'pending',
            txHash: payload.values.txHash,
            explorerUrl: payload.values.explorerUrl,
          })
        }
      })
      kit.on('bridge.burn', (payload) => {
        const v = payload.values
        setStep('burn', {
          state: v.state === 'success' ? 'success' : 'pending',
          txHash: v.txHash,
          explorerUrl: v.explorerUrl,
        })
        if (v.state === 'success' && v.txHash) {
          setBurnDone(true)
          const record: PersistedBridge = {
            burnTxHash: v.txHash,
            amount,
            recipient,
            timestamp: Date.now(),
          }
          // Embed ageLabel in record (computed in event handler, not during render)
          const recordWithLabel: PersistedBridge = { ...record, ageLabel: makeAgeLabel(record.timestamp) }
          try { localStorage.setItem(LS_KEY, JSON.stringify(recordWithLabel)) } catch { /* ignore */ }
          setPending(recordWithLabel)
        }
      })
      kit.on('bridge.fetchAttestation', (payload) => {
        if (payload.protocol === 'cctp') {
          setStep('fetchAttestation', {
            state: payload.values.state === 'success' ? 'success' : 'pending',
          })
        }
      })
      kit.on('bridge.mint', (payload) => {
        const v = payload.values
        setStep('mint', {
          state: v.state === 'success' ? 'success' : 'pending',
          txHash: v.txHash,
          explorerUrl: v.explorerUrl,
        })
      })

      // Mark first step pending
      setStep('approve', { state: 'pending' })

      // 3. Execute bridge (useForwarder: true = no dest wallet, no gas on Arc)
      const result = await kit.bridge({
        from: { adapter, chain: SRC_CHAIN },
        to: {
          chain: DST_CHAIN,
          recipientAddress: recipient,
          useForwarder: true,
        },
        amount,
      })

      lastResultRef.current = result

      if (result.state === 'error') {
        setCanRetry(true)
        const failedStep = result.steps?.find((s) => s.state === 'error')
        if (failedStep) {
          setStep(failedStep.name as BridgeStep['name'], {
            state: 'error',
            error: typeof failedStep.error === 'string' ? failedStep.error : 'Step failed',
          })
          setBridgeError(`Failed at "${failedStep.name}": ${typeof failedStep.error === 'string' ? failedStep.error : 'Unknown error'}`)
        } else {
          setBridgeError('Bridge failed. Check step details.')
        }
      } else {
        result.steps?.forEach((s) => {
          setStep(s.name as BridgeStep['name'], {
            state: s.state as BridgeStep['state'],
            txHash: s.txHash,
            explorerUrl: s.explorerUrl,
          })
        })
        setBridgeSuccess(true)
        void refetchUsdc()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('user rejected') || msg.includes('4001')) {
        setBridgeError('Transaction cancelled.')
      } else {
        setBridgeError(msg)
      }
    } finally {
      setBridging(false)
    }
  }, [address, connector, walletChainId, switchChainAsync, amount, recipient, setStep, refetchUsdc])

  // ── Retry ───────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(async () => {
    if (!lastResultRef.current || !connector) return
    setBridging(true)
    setBridgeError(null)
    setCanRetry(false)
    try {
      if (walletChainId !== ARB_CHAIN_ID) {
        await switchChainAsync({ chainId: ARB_CHAIN_ID })
      }
      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter = await createViemAdapterFromProvider({ provider })
      const retryResult = await kit.retryBridge(lastResultRef.current, {
        from: adapter,
        to: adapter,
      })
      lastResultRef.current = retryResult
      if (retryResult.state === 'error') {
        setCanRetry(true)
        const failedStep = retryResult.steps?.find((s) => s.state === 'error')
        setBridgeError(failedStep
          ? `Retry failed at "${failedStep.name}": ${typeof failedStep.error === 'string' ? failedStep.error : 'Unknown error'}`
          : 'Retry failed.')
      } else {
        retryResult.steps?.forEach((s) => {
          setStep(s.name as BridgeStep['name'], {
            state: s.state as BridgeStep['state'],
            txHash: s.txHash,
            explorerUrl: s.explorerUrl,
          })
        })
        setBridgeSuccess(true)
        void refetchUsdc()
      }
    } catch (err) {
      setCanRetry(true)
      setBridgeError(err instanceof Error ? err.message : String(err))
    } finally {
      setBridging(false)
    }
  }, [connector, walletChainId, switchChainAsync, setStep, refetchUsdc])

  // ── Render ──────────────────────────────────────────────────────────────────
  const isActive = bridging || bridgeSuccess || bridgeError !== null
  const arbExplorerBase = arbChainInfo.explorerBase



  return (
    <div className="w-full max-w-md mx-auto px-4 py-8 flex flex-col gap-4">
      {/* Persisted pending banner */}
      {pending && (
        <PendingBridgeBanner
          record={pending}
          arbExplorerBase={arbExplorerBase}
          onDismiss={() => {
            setPending(null)
            try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
          }}
        />
      )}

      {/* ── Main card ── */}
      <div
        className="rounded-3xl p-6 flex flex-col gap-5"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>Bridge USDC</h1>
          <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(232,109,122,0.15)', color: 'var(--danger)', border: '1px solid rgba(232,109,122,0.25)' }}>
            <ShieldAlert className="size-3" />
            Mainnet
          </div>
        </div>

        {/* Route */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <NetworkArbitrumOne variant="branded" size={20} />
            <span className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Arbitrum</span>
          </div>
          <ArrowRight className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
          <div className="flex items-center gap-2 flex-1 rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: 'var(--accent)', color: '#0d1b2f' }}>A</div>
            <span className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Arc</span>
          </div>
        </div>

        {/* Balances */}
        {address && (
          <div className="flex items-center justify-between rounded-2xl px-4 py-3 text-xs" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5">
              <TokenUSDC variant="branded" size={14} />
              <span style={{ color: 'var(--muted)' }}>USDC:</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{usdcBalanceFormatted}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span style={{ color: 'var(--muted)' }}>ETH gas:</span>
              <span className="font-semibold tabular-nums" style={{ color: isLowGas ? 'var(--danger)' : 'var(--ink)' }}>
                {ethBalance ? parseFloat(ethBalance.formatted).toFixed(4) : '—'}
              </span>
              {isLowGas && <AlertTriangle className="size-3" style={{ color: 'var(--danger)' }} />}
            </div>
          </div>
        )}

        {isLowGas && (
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(232,109,122,0.1)', color: 'var(--danger)', border: '1px solid rgba(232,109,122,0.2)' }}>
            <AlertTriangle className="size-3 shrink-0" />
            Low ETH — you may not have enough to pay gas on Arbitrum.
          </div>
        )}

        {/* Amount input */}
        <div>
          <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--muted)' }}>AMOUNT</label>
          <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: `1px solid ${amountError ? 'var(--danger)' : 'var(--border)'}` }}>
            <div className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
                }}
                placeholder="0.00"
                disabled={isActive}
                className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:opacity-20 disabled:opacity-50"
                style={{ color: 'var(--ink)' }}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <TokenUSDC variant="branded" size={20} />
                <span className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>USDC</span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>Native USDC via CCTP</span>
              <button
                disabled={!usdcBalance || isActive}
                onClick={() => usdcBalance && setAmount(Amount.fromRaw(usdcBalance, usdcDecimalsFor(ARB_CHAIN_ID)).toFixed(6))}
                className="text-xs font-semibold disabled:opacity-40 transition-opacity"
                style={{ color: 'var(--accent)' }}
              >
                {usdcBalance !== undefined ? `Max: ${usdcBalanceFormatted}` : '—'}
              </button>
            </div>
          </div>
          {amountError && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>{amountError}</p>
          )}
        </div>

        {/* Recipient */}
        <div>
          <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--muted)' }}>RECIPIENT ON ARC</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            placeholder="0x…"
            disabled={isActive}
            className="mono w-full rounded-2xl px-4 py-3 text-sm outline-none disabled:opacity-50"
            style={{
              background: 'var(--surface)',
              border: `1px solid ${recipientError ? 'var(--danger)' : 'var(--border)'}`,
              color: 'var(--ink-2)',
            }}
          />
          {recipientError && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>{recipientError}</p>
          )}
          {address && recipient.toLowerCase() === address.toLowerCase() && !recipientError && (
            <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: 'var(--subtle)' }}>
              <CheckCircle2 className="size-3" /> Defaulted to your connected address
            </p>
          )}
        </div>

        {/* Estimate */}
        {parsedAmount !== null && !amountError && isAddress(recipient) && recipient !== zeroAddress && (
          <div className="rounded-2xl px-4 py-3 text-xs flex flex-col gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {estimating && (
              <div className="flex items-center gap-2" style={{ color: 'var(--subtle)' }}>
                <Loader2 className="size-3 animate-spin" /> Fetching estimate…
              </div>
            )}
            {estimateError && !estimating && (
              <div className="flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
                <AlertTriangle className="size-3" /> {estimateError}
              </div>
            )}
            {estimate && !estimating && (
              <>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Forwarding fee</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{parseFloat(estimate.fee).toFixed(4)} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>You receive on Arc</span>
                  <span className="font-bold tabular-nums" style={{ color: 'var(--success)' }}>{parseFloat(estimate.received).toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Gas on Arc</span>
                  <span className="font-semibold" style={{ color: 'var(--success)' }}>None (Circle forwards)</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Mainnet notice + acknowledgement */}
        <div className="rounded-2xl px-4 py-3 flex flex-col gap-3" style={{ background: 'rgba(232,109,122,0.08)', border: '1px solid rgba(232,109,122,0.2)' }}>
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--danger)' }}>
            <Info className="size-3.5 mt-0.5 shrink-0" />
            <span className="text-pretty leading-relaxed">
              This transfers <strong>real USDC on mainnet</strong>. Transactions are irreversible. Verify the recipient address carefully before proceeding.
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              disabled={isActive}
              className="size-4 rounded"
            />
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>I understand this is a mainnet transfer</span>
          </label>
        </div>

        {/* Wrong chain switch */}
        {address && onWrongChain && (
          <button
            onClick={() => { void switchChainAsync({ chainId: ARB_CHAIN_ID }) }}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'var(--accent)', color: '#0d1b2f' }}
          >
            Switch to Arbitrum
          </button>
        )}

        {/* Bridge CTA */}
        {(!address || !onWrongChain) && (
          <button
            disabled={!address || !canBridge}
            onClick={() => { void handleBridge() }}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#0d1b2f' }}
          >
            {!address
              ? 'Connect Wallet'
              : bridging
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Bridging…</span>
              : 'Bridge to Arc'}
          </button>
        )}

        {/* Chain unknown error */}
        {arbUsdc === undefined && (
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(232,109,122,0.1)', color: 'var(--danger)', border: '1px solid rgba(232,109,122,0.2)' }}>
            <XCircle className="size-3 shrink-0" />
            USDC address for Arbitrum not found in onchain registry. Cannot read balance.
          </div>
        )}
        {ARC_CHAIN_ID === undefined && (
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(232,109,122,0.1)', color: 'var(--danger)', border: '1px solid rgba(232,109,122,0.2)' }}>
            <XCircle className="size-3 shrink-0" />
            Arc chain not found in onchain registry.
          </div>
        )}
      </div>

      {/* Step tracker */}
      {isActive && (
        <StepTracker
          steps={steps}
          bridgeSuccess={bridgeSuccess}
          burnDone={burnDone}
          bridgeError={bridgeError}
          recipient={recipient}
          onRetry={canRetry && bridgeError ? () => { void handleRetry() } : undefined}
          retrying={bridging && canRetry}
        />
      )}

      {/* Footer */}
      <p className="text-center text-xs leading-relaxed px-2" style={{ color: 'var(--subtle)' }}>
        Powered by Circle CCTP. Bridge operations are permissionless and irreversible.{' '}
        <a
          href="https://developers.circle.com/cctp"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
          style={{ color: 'var(--accent)' }}
        >
          Learn more
        </a>
      </p>
    </div>
  )
}
