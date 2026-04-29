/**
 * BulkSendModal
 *
 * 3-step wizard for sending personalised bulk email.
 *
 *  Step 1 — Import    (BulkImportStep)   CSV / TXT / JSON, field mapping
 *  Step 2 — Compose   (BulkComposeStep)  Rich editor, variable picker, preview
 *  Step 3 — Progress  (inline)           Live progress, batch history, retry
 */
import { useState, useEffect } from 'react'
import {
  CheckCircle, Loader, Pause, Play, Square,
  ArrowDownToLine, AlertTriangle, RefreshCw,
  ChevronDown, RotateCcw, List, BarChart2,
  Settings2, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal        from '../ui/Modal'
import useMailStore from '../../store/mailStore'
import useBulkSendStore from '../../store/bulkSendStore'
import BulkImportStep  from './BulkImportStep'
import BulkComposeStep from './BulkComposeStep'

// ── Helpers ───────────────────────────────────────────────────────────────────
const BATCH_SIZES = [5, 10, 20, 50, 100]
const BATCH_DELAYS = [
  { value: 0,         label: 'No delay' },
  { value: 1000,      label: '1 sec'    },
  { value: 2000,      label: '2 sec'    },
  { value: 5000,      label: '5 sec'    },
  { value: 10000,     label: '10 sec'   },
  { value: 30000,     label: '30 sec'   },
  { value: 60000,     label: '1 min'    },
  { value: 120000,    label: '2 min'    },
  { value: 300000,    label: '5 min'    },
  { value: 600000,    label: '10 min'   },
  { value: 1800000,   label: '30 min'   },
  { value: 3600000,   label: '1 hour'   },
]

function fmtDelay(ms) {
  if (!ms)          return 'No delay'
  if (ms < 60000)   return `${ms / 1000}s`
  if (ms < 3600000) return `${ms / 60000}m`
  return `${ms / 3600000}h`
}

function fmtETA(ms) {
  if (ms < 1000)    return '< 1s'
  if (ms < 60000)   return `~${Math.ceil(ms / 1000)}s`
  if (ms < 3600000) return `~${Math.ceil(ms / 60000)}m`
  return `~${(ms / 3600000).toFixed(1)}h`
}

function fmtDuration(ms) {
  if (ms < 1000)    return `${ms}ms`
  if (ms < 60000)   return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  catch { return iso }
}

function ProgressBar({ value, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="w-full bg-surface-border rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Batch History ─────────────────────────────────────────────────────────────
function BatchHistory({ history, totalFailed, onRetryAll, onRetryAddresses }) {
  const [expanded,       setExpanded]       = useState(new Set())
  const [expandedFailed, setExpandedFailed] = useState({})

  function toggleBatch(n) {
    setExpanded(p => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s })
  }
  function toggleFailed(batchNum, i) {
    setExpandedFailed(p => {
      const s = new Set(p[batchNum] ?? [])
      s.has(i) ? s.delete(i) : s.add(i)
      return { ...p, [batchNum]: s }
    })
  }

  if (!history.length) {
    return <p className="text-xs text-gray-600 text-center py-5">No batches completed yet.</p>
  }

  return (
    <div className="space-y-2">
      {totalFailed > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg">
          <span className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={11} /> {totalFailed} failed across all batches
          </span>
          <button onClick={onRetryAll}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-white hover:bg-red-500/20 px-2.5 py-1 rounded-lg transition-colors">
            <RefreshCw size={11} /> Retry all
          </button>
        </div>
      )}

      <div className="space-y-1 max-h-64 overflow-y-auto pr-0.5">
        {history.map(b => {
          const isOpen = expanded.has(b.batchNum)
          const fSet   = expandedFailed[b.batchNum] ?? new Set()
          const pct    = b.recipients.length > 0 ? Math.round((b.sent / b.recipients.length) * 100) : 0

          return (
            <div key={b.batchNum} className="border border-surface-border rounded-lg overflow-hidden">
              <button onClick={() => toggleBatch(b.batchNum)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-raised transition-colors text-left">
                <span className="text-[10px] font-mono text-gray-600 w-10 flex-shrink-0">#{b.batchNum}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
                    <span className="text-gray-400">{fmtTime(b.sentAt)}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-green-400">{b.sent} sent</span>
                      {b.failed.length > 0 && <span className="text-red-400">{b.failed.length} failed</span>}
                      <span className="text-gray-600">{fmtDuration(b.durationMs)}</span>
                    </span>
                  </div>
                  <div className="w-full h-1 bg-surface-border rounded-full overflow-hidden flex">
                    <div className="h-full bg-green-500/60" style={{ width: `${pct}%` }} />
                    {b.failed.length > 0 && (
                      <div className="h-full bg-red-500/60"
                        style={{ width: `${Math.round((b.failed.length / b.recipients.length) * 100)}%` }} />
                    )}
                  </div>
                </div>
                <ChevronDown size={11} className={`flex-shrink-0 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="border-t border-surface-border bg-surface px-3 py-2.5 space-y-2">
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">
                      Recipients ({b.recipients.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {b.recipients.map(email => {
                        const didFail = b.failed.some(f => f.email === email)
                        return (
                          <span key={email} className={`text-[10px] px-1.5 py-0.5 rounded ${
                            didFail
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-green-500/10 text-green-400'
                          }`}>{email}</span>
                        )
                      })}
                    </div>
                  </div>

                  {b.failed.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider">Errors</p>
                        <button onClick={() => onRetryAddresses(b.failed.map(f => f.email))}
                          className="flex items-center gap-1 text-[10px] text-red-400 hover:text-white px-2 py-0.5 rounded hover:bg-red-500/20 transition-colors">
                          <RotateCcw size={9} /> Retry batch
                        </button>
                      </div>
                      <div className="space-y-px">
                        {b.failed.map((f, i) => (
                          <div key={i}>
                            <button onClick={() => toggleFailed(b.batchNum, i)}
                              className="w-full flex items-center justify-between text-[11px] bg-red-500/5 hover:bg-red-500/10 px-2.5 py-1.5 rounded transition-colors text-left">
                              <span className="text-gray-300 truncate max-w-[40%]">{f.email}</span>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-red-400/70 text-[10px] truncate">{f.reason}</span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button onMouseDown={e => { e.stopPropagation(); onRetryAddresses([f.email]) }}
                                    className="p-0.5 rounded text-gray-600 hover:text-brand transition-colors">
                                    <RotateCcw size={10} />
                                  </button>
                                  <ChevronDown size={10} className={`text-gray-600 transition-transform ${fSet.has(i) ? 'rotate-180' : ''}`} />
                                </div>
                              </div>
                            </button>
                            {fSet.has(i) && (
                              <div className="px-2.5 py-2 bg-red-500/[0.07] border-t border-red-500/10 rounded-b">
                                <p className="text-[10px] text-gray-500 mb-0.5 uppercase tracking-wider">Full error</p>
                                <p className="text-xs text-red-300 break-words">{f.reason}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function BulkSendModal({ open, onClose }) {
  const { accounts } = useMailStore()
  const store = useBulkSendStore()

  // Wizard state
  const [step,        setStep]        = useState(1)
  const [recipients,  setRecipients]  = useState([])   // {email, data}[]
  const [base64Fields,setBase64Fields]= useState([])   // field names whose values are b64
  const [accountId,   setAccountId]   = useState(null)
  const [subject,     setSubject]     = useState('')
  const [body,        setBody]        = useState('')
  const [batchSize,   setBatchSize]   = useState(10)
  const [batchDelay,  setBatchDelay]  = useState(2000)

  // Step-3 UI state
  const [progressTab,    setProgressTab]    = useState('details')
  const [showLiveConfig, setShowLiveConfig] = useState(false)
  const [countdown,      setCountdown]      = useState(0)
  const [etaMs,          setEtaMs]          = useState(null)

  // ── Countdown + ETA ticker ────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 3) return
    const id = setInterval(() => {
      const s = useBulkSendStore.getState()
      setCountdown(s.nextBatchAt ? Math.max(0, Math.ceil((s.nextBatchAt - Date.now()) / 1000)) : 0)

      const rem = s.totalRecipients - s.processedCount
      if (rem <= 0 || !s.batchDurations.length) { setEtaMs(null); return }
      const bs   = s.batchSize
      const rbs  = Math.ceil(rem / bs)
      const avg  = s.batchDurations.reduce((a, b) => a + b, 0) / s.batchDurations.length
      const cdMs = s.nextBatchAt ? Math.max(0, s.nextBatchAt - Date.now()) : 0
      setEtaMs(Math.max(0, cdMs + rbs * avg + Math.max(0, rbs - 1) * s.batchDelay))
    }, 250)
    return () => clearInterval(id)
  }, [step])

  // Jump to step 3 if a job is already running when modal opens
  useEffect(() => {
    if (open && store.status !== 'idle') setStep(3)
  }, [open]) // eslint-disable-line

  // ── Reset ────────────────────────────────────────────────────────────────
  function resetWizard() {
    setStep(1); setRecipients([]); setSubject(''); setBody('')
    setBatchSize(10); setBatchDelay(2000)
    setProgressTab('details'); setShowLiveConfig(false)
    setCountdown(0); setEtaMs(null)
    setAccountId(accounts[0]?.id ?? null)
  }

  function handleClose() {
    const active = store.status === 'running' || store.status === 'paused'
    if (active) {
      toast('Job continuing in background. Watch the pill at the bottom-right.', { icon: '⚡' })
    } else {
      store.reset(); resetWizard()
    }
    onClose()
  }

  // ── Import complete ──────────────────────────────────────────────────────
  function handleImportDone({ recipients: recs, base64Fields: b64 = [] }) {
    setRecipients(recs)
    setBase64Fields(b64)
    if (!accountId && accounts[0]) setAccountId(accounts[0].id)
    setStep(2)
  }

  // ── Start sending ────────────────────────────────────────────────────────
  function handleSend() {
    store.startSending({
      accountId,
      subjectTemplate: subject,
      bodyTemplate:    body,
      recipients,
      batchSize,
      batchDelay,
      base64Fields,
    })
    setProgressTab('details')
    setStep(3)
  }

  // ── Retry helpers ────────────────────────────────────────────────────────
  function handleRetryAll() {
    store.retryAllFailed(); setProgressTab('details')
  }

  function handleRetryAddresses(emails) {
    store.retryAddresses(emails); setProgressTab('details')
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const {
    status, sent, failed, currentBatch, totalBatches: storeBatches,
    totalRecipients, processedCount, batchHistory,
    pause, resume, cancel, setLiveBatchSize, setLiveDelay,
  } = store

  const isActive  = status === 'running' || status === 'paused'
  const isRunning = status === 'running'
  const isDone    = status === 'done' || status === 'cancelled'
  const remaining = Math.max(0, totalRecipients - processedCount)
  const pct       = totalRecipients > 0 ? Math.round((processedCount / totalRecipients) * 100) : 0

  // ── Stepper ──────────────────────────────────────────────────────────────
  const STEPS = ['Import', 'Compose', 'Progress']

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Email Send" size="xl">

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-5 text-xs">
        {STEPS.map((label, i) => {
          const n      = i + 1
          const done   = step > n
          const active = step === n
          return (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                active ? 'bg-brand text-white' : done ? 'bg-green-500 text-white' : 'bg-surface-border text-gray-500'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={active ? 'text-white font-medium' : 'text-gray-500'}>{label}</span>
              {i < 2 && <span className="text-gray-700">›</span>}
            </div>
          )
        })}
      </div>

      {/* ══════════════════════ STEP 1: Import ══════════════════════ */}
      {step === 1 && (
        <BulkImportStep onComplete={handleImportDone} />
      )}

      {/* ══════════════════════ STEP 2: Compose ══════════════════════ */}
      {step === 2 && (
        <BulkComposeStep
          recipients={recipients}
          accounts={accounts}
          base64Fields={base64Fields}
          accountId={accountId}   setAccountId={setAccountId}
          subject={subject}       setSubject={setSubject}
          body={body}             setBody={setBody}
          batchSize={batchSize}   setBatchSize={setBatchSize}
          batchDelay={batchDelay} setBatchDelay={setBatchDelay}
          onBack={() => setStep(1)}
          onSend={handleSend}
        />
      )}

      {/* ══════════════════════ STEP 3: Progress ══════════════════════ */}
      {step === 3 && (
        <div className="space-y-4">

          {/* Status + controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isRunning              && <Loader      size={14} className="animate-spin text-brand" />}
              {status === 'paused'    && <Pause       size={14} className="text-yellow-400" />}
              {status === 'cancelled' && <Square      size={14} className="text-red-400" />}
              {status === 'done'      && <CheckCircle size={14} className="text-green-400" />}
              <span className={`text-sm font-medium ${
                isRunning             ? 'text-white'
                : status === 'paused' ? 'text-yellow-400'
                : status === 'done'   ? 'text-green-400'
                : 'text-red-400'
              }`}>
                {isRunning ? 'Sending…' : status === 'paused' ? 'Paused' : status === 'done' ? 'Complete' : 'Cancelled'}
              </span>
            </div>
            <div className="flex gap-1.5">
              {isRunning && (
                <button onClick={pause} className="btn-ghost gap-1 text-xs py-1">
                  <Pause size={11} /> Pause
                </button>
              )}
              {status === 'paused' && (
                <button onClick={resume} className="btn-primary gap-1 text-xs py-1">
                  <Play size={11} /> Resume
                </button>
              )}
              {isActive && (
                <>
                  <button onClick={handleClose} className="btn-ghost gap-1 text-xs py-1 text-gray-400 hover:text-brand">
                    <ArrowDownToLine size={11} /> Background
                  </button>
                  <button onClick={cancel} className="btn-ghost gap-1 text-xs py-1 hover:text-red-400">
                    <Square size={11} /> Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Batch {currentBatch} / {storeBatches}</span>
              <span>{processedCount} / {totalRecipients} ({pct}%)</span>
            </div>
            <ProgressBar value={processedCount} total={totalRecipients} />
          </div>

          {/* Countdown + ETA */}
          {isRunning && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5">
                {countdown > 0 ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400/80 animate-pulse flex-shrink-0" />
                    <Clock size={10} className="text-yellow-400/70" />
                    <span className="text-yellow-300/80">Next batch in {countdown}s</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse flex-shrink-0" />
                    <span className="text-gray-400">Sending batch…</span>
                  </>
                )}
              </span>
              {etaMs !== null && (
                <span className="text-gray-600">ETA: <span className="text-gray-400">{fmtETA(etaMs)}</span></span>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Sent',      value: sent,          color: 'text-green-400' },
              { label: 'Failed',    value: failed.length, color: failed.length ? 'text-red-400' : 'text-gray-400' },
              { label: 'Remaining', value: remaining,     color: 'text-gray-300' },
            ].map(s => (
              <div key={s.label} className="text-center bg-surface rounded-xl p-3 border border-surface-border">
                <p className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div>
            <div className="flex gap-0 border-b border-surface-border mb-3">
              {[
                { id: 'details', label: 'Details',                           icon: <BarChart2 size={11} /> },
                { id: 'history', label: `Batches (${batchHistory.length})`,  icon: <List size={11} />     },
              ].map(t => (
                <button key={t.id} onClick={() => setProgressTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-b-2 -mb-px ${
                    progressTab === t.id ? 'border-brand text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Details tab */}
            {progressTab === 'details' && (
              <div className="space-y-3">
                {/* Live settings */}
                {isActive && (
                  <div className="border border-surface-border rounded-xl overflow-hidden">
                    <button onClick={() => setShowLiveConfig(o => !o)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-400 hover:bg-surface-raised transition-colors">
                      <span className="flex items-center gap-2">
                        <Settings2 size={12} /> Live settings
                        <span className="text-gray-600">— {store.batchSize}/batch · {fmtDelay(store.batchDelay)} between batches</span>
                      </span>
                      <ChevronDown size={11} className={`transition-transform ${showLiveConfig ? 'rotate-180' : ''}`} />
                    </button>
                    {showLiveConfig && (
                      <div className="px-4 pb-4 pt-1 border-t border-surface-border space-y-4 bg-surface-raised">
                        <div>
                          <p className="text-[11px] text-gray-500 mb-2">Emails per batch</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {BATCH_SIZES.map(n => (
                              <button key={n} onClick={() => setLiveBatchSize(n)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                  store.batchSize === n ? 'bg-brand/20 text-brand' : 'text-gray-500 hover:bg-surface hover:text-white'
                                }`}>{n}</button>
                            ))}
                          </div>
                          <p className="text-[10px] text-gray-600 mt-1.5">Takes effect on the next batch.</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-gray-500 mb-2">Delay between batches</p>
                          <div className="grid grid-cols-6 gap-1.5">
                            {BATCH_DELAYS.map(d => (
                              <button key={d.value} onClick={() => setLiveDelay(d.value)}
                                className={`px-2 py-1.5 rounded-lg text-[11px] font-medium text-center transition-colors ${
                                  store.batchDelay === d.value ? 'bg-brand/20 text-brand' : 'text-gray-500 hover:bg-surface hover:text-white'
                                }`}>{d.label}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Failed list */}
                {failed.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                        <AlertTriangle size={11} className="text-red-400" />
                        {failed.length} failed recipient{failed.length !== 1 ? 's' : ''}
                      </p>
                      {isDone && (
                        <button onClick={handleRetryAll}
                          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-red-500/20 transition-colors">
                          <RefreshCw size={11} /> Retry all
                        </button>
                      )}
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-red-500/20">
                      {failed.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 border-b border-red-500/10 last:border-0">
                          <span className="text-gray-300 truncate max-w-[45%]">{f.email}</span>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-red-400/70 text-[10px] truncate">{f.reason}</span>
                            <button onClick={() => handleRetryAddresses([f.email])} title="Retry"
                              className="flex-shrink-0 p-0.5 rounded text-gray-600 hover:text-brand transition-colors">
                              <RotateCcw size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!failed.length && isDone && (
                  <div className="flex items-center justify-center gap-2 py-4 text-green-400 text-sm">
                    <CheckCircle size={16} /> All {sent} emails sent successfully!
                  </div>
                )}
              </div>
            )}

            {/* History tab */}
            {progressTab === 'history' && (
              <BatchHistory
                history={batchHistory}
                totalFailed={failed.length}
                onRetryAll={handleRetryAll}
                onRetryAddresses={handleRetryAddresses}
              />
            )}
          </div>

          {/* Done buttons */}
          {isDone && (
            <div className="flex justify-end gap-2 pt-1 border-t border-surface-border">
              <button onClick={() => { store.reset(); resetWizard() }} className="btn-ghost text-xs">Send another</button>
              <button onClick={() => { store.reset(); resetWizard(); onClose() }} className="btn-primary text-xs">Done</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
