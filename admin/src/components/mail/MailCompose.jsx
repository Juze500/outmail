import { useState, useEffect, useRef } from 'react'
import { X, Minus, ChevronUp, Send, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../../store/mailStore'
import { sendEmail, replyEmail, forwardEmail, createDraft, updateDraft, deleteDraft } from '../../api/mail'

// ── Sub-components ────────────────────────────────────────────────────────────

function RichEditor({ value, onChange, placeholder = 'Write your message…' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || ''
  }, []) // eslint-disable-line
  return (
    <div className="relative flex-1">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={e => onChange(e.currentTarget.innerHTML)}
        className="min-h-[180px] text-sm text-gray-100 p-3 focus:outline-none"
        style={{ lineHeight: 1.6 }}
      />
      {!value && (
        <p className="absolute top-3 left-3 text-sm text-gray-600 pointer-events-none">{placeholder}</p>
      )}
    </div>
  )
}

function RecipientInput({ label, recipients, onChange }) {
  const [input, setInput] = useState('')
  function add() {
    const email = input.trim()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error(`Invalid email: ${email}`); return }
    onChange([...recipients, { email, name: '' }])
    setInput('')
  }
  function remove(i) { onChange(recipients.filter((_, idx) => idx !== i)) }
  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-surface-border min-h-[36px]">
      <span className="text-xs text-gray-500 mt-1 w-8 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap items-center gap-1 flex-1">
        {recipients.map((r, i) => (
          <span key={i} className="flex items-center gap-1 bg-surface-border text-gray-300 text-xs rounded px-2 py-0.5">
            {r.name || r.email}
            <button onClick={() => remove(i)} className="text-gray-500 hover:text-white"><X size={10} /></button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); add() }
            if (e.key === 'Backspace' && !input && recipients.length) remove(recipients.length - 1)
          }}
          onBlur={add}
          placeholder={recipients.length === 0 ? 'Add recipient…' : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-gray-100 focus:outline-none placeholder-gray-600"
        />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MailCompose() {
  const { compose, setCompose, accounts, removeDraft, addOrUpdateDraft } = useMailStore()

  const [accountId,   setAccountId]   = useState(null)
  const [to,          setTo]          = useState([])
  const [cc,          setCc]          = useState([])
  const [bcc,         setBcc]         = useState([])
  const [subject,     setSubject]     = useState('')
  const [body,        setBody]        = useState('')
  const [showCc,      setShowCc]      = useState(false)
  const [showBcc,     setShowBcc]     = useState(false)
  const [minimized,   setMinimized]   = useState(false)
  const [sending,     setSending]     = useState(false)
  const [savedStatus, setSavedStatus] = useState(null) // null | 'saving' | 'saved'

  // Tracks the server-side draft ID for the current compose session
  const savedDraftIdRef = useRef(null)

  // ── Initialise fields when compose changes ─────────────────────────────────
  useEffect(() => {
    if (!compose) return
    savedDraftIdRef.current = null
    setSavedStatus(null)
    setShowCc(false); setShowBcc(false); setMinimized(false)
    setAccountId(accounts[0]?.id ?? null)

    const { mode, email, draft } = compose

    if (mode === 'draft' && draft) {
      // Resume an existing local draft
      savedDraftIdRef.current = draft.id
      setAccountId(draft.account_id ?? accounts[0]?.id ?? null)
      setTo(draft.to   ?? [])
      setCc(draft.cc   ?? [])
      setBcc(draft.bcc ?? [])
      setSubject(draft.subject ?? '')
      setBody(draft.body ?? '')
      if ((draft.cc  ?? []).length) setShowCc(true)
      if ((draft.bcc ?? []).length) setShowBcc(true)
      return
    }

    if (mode === 'new') {
      setTo([]); setCc([]); setBcc([]); setSubject(''); setBody('')
      return
    }

    if (mode === 'reply') {
      setTo([{ email: email.sender_email, name: email.sender_name || '' }])
      setCc([]); setBcc([])
      setSubject(`Re: ${email.subject || ''}`)
      setBody(buildQuote(email))
    }
    if (mode === 'replyAll') {
      setTo([{ email: email.sender_email, name: email.sender_name || '' }])
      setCc([]); setBcc([])
      setSubject(`Re: ${email.subject || ''}`)
      setBody(buildQuote(email))
    }
    if (mode === 'forward') {
      setTo([]); setCc([]); setBcc([])
      setSubject(`Fwd: ${email.subject || ''}`)
      setBody(buildForwardQuote(email))
    }
  }, [compose]) // eslint-disable-line

  // ── Auto-save: debounced 30 s after last change ────────────────────────────
  useEffect(() => {
    if (!compose || (compose.mode !== 'new' && compose.mode !== 'draft')) return
    const plainBody  = (body || '').replace(/<[^>]*>/g, '').trim()
    const hasContent = to.length > 0 || subject.trim() || plainBody
    if (!hasContent) return

    const timer = setTimeout(() => doSave(true), 30_000)
    return () => clearTimeout(timer)
  }, [to, cc, bcc, subject, body, accountId]) // eslint-disable-line

  // ── Helpers ───────────────────────────────────────────────────────────────
  function buildQuote(email) {
    const from = email.sender_email || ''
    const date = email.received_at ? new Date(email.received_at).toLocaleString() : ''
    return `<br><br><hr style="border-color:#3a3a52"><p style="color:#9ca3af;font-size:12px">On ${date}, ${from} wrote:</p><blockquote style="margin-left:12px;padding-left:12px;border-left:2px solid #3a3a52;color:#9ca3af">${email.body?.body_html || email.body_preview || ''}</blockquote>`
  }
  function buildForwardQuote(email) {
    const from = email.sender_email || ''
    const date = email.received_at ? new Date(email.received_at).toLocaleString() : ''
    return `<br><br><hr style="border-color:#3a3a52"><p style="color:#9ca3af;font-size:12px">---------- Forwarded message ----------<br>From: ${from}<br>Date: ${date}<br>Subject: ${email.subject || ''}</p>${email.body?.body_html || email.body_preview || ''}`
  }

  async function doSave(silent = false) {
    if (!silent) setSavedStatus('saving')
    const payload = { account_id: accountId, to, cc, bcc, subject, body }
    try {
      if (savedDraftIdRef.current) {
        const data = await updateDraft(savedDraftIdRef.current, payload)
        addOrUpdateDraft(data.draft)
      } else {
        const data = await createDraft(payload)
        savedDraftIdRef.current = data.draft.id
        addOrUpdateDraft(data.draft)
      }
      setSavedStatus('saved')
      if (!silent) toast.success('Draft saved')
      setTimeout(() => setSavedStatus(null), 2500)
    } catch {
      setSavedStatus(null)
      if (!silent) toast.error('Failed to save draft')
    }
  }

  async function handleSend() {
    if (!accountId) { toast.error('Select a sending account.'); return }
    if (to.length === 0) { toast.error('Add at least one recipient.'); return }
    if (!subject.trim()) { toast.error('Subject is required.'); return }
    setSending(true)
    try {
      const { mode, email } = compose
      if (mode === 'reply')         await replyEmail(email.id, body, false)
      else if (mode === 'replyAll') await replyEmail(email.id, body, true)
      else if (mode === 'forward')  await forwardEmail(email.id, body, to)
      else                          await sendEmail({ account_id: accountId, subject, body, body_type: 'html', to, cc: cc.length ? cc : undefined, bcc: bcc.length ? bcc : undefined })

      // Delete the draft from DB + store after a successful send
      if (savedDraftIdRef.current) {
        deleteDraft(savedDraftIdRef.current).catch(() => {})
        removeDraft(savedDraftIdRef.current)
      }

      toast.success('Email sent!')
      setCompose(null)
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to send.')
    } finally {
      setSending(false)
    }
  }

  if (!compose) return null

  const isDraftMode = compose.mode === 'new' || compose.mode === 'draft'
  const modeLabel   = { new: 'New Message', reply: 'Reply', replyAll: 'Reply All', forward: 'Forward', draft: 'Edit Draft' }[compose.mode] ?? 'Compose'

  return (
    <div className={`fixed bottom-0 right-6 z-50 w-[560px] bg-surface-raised border border-surface-border rounded-t-xl shadow-2xl flex flex-col transition-all ${minimized ? 'h-10' : 'h-[490px]'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-border bg-surface rounded-t-xl">
        <span className="text-sm font-medium text-white flex-1">{modeLabel}</span>
        {savedStatus === 'saving' && <span className="text-[10px] text-gray-500 animate-pulse">Saving…</span>}
        {savedStatus === 'saved'  && <span className="text-[10px] text-green-400">✓ Saved</span>}
        <button onClick={() => setMinimized(!minimized)} className="p-1 rounded hover:bg-surface-border text-gray-500 hover:text-white transition-colors">
          {minimized ? <ChevronUp size={13} /> : <Minus size={13} />}
        </button>
        <button onClick={() => setCompose(null)} className="p-1 rounded hover:bg-surface-border text-gray-500 hover:text-white transition-colors">
          <X size={13} />
        </button>
      </div>

      {!minimized && (
        <>
          {/* From selector */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-border">
            <span className="text-xs text-gray-500 w-8 flex-shrink-0">From</span>
            <select value={accountId ?? ''} onChange={e => setAccountId(parseInt(e.target.value))}
              className="flex-1 bg-transparent text-sm text-gray-100 focus:outline-none">
              {accounts.map(a => (
                <option key={a.id} value={a.id} className="bg-surface-raised">{a.email}</option>
              ))}
            </select>
          </div>

          <RecipientInput label="To"  recipients={to}  onChange={setTo} />
          {showCc  && <RecipientInput label="Cc"  recipients={cc}  onChange={setCc} />}
          {showBcc && <RecipientInput label="Bcc" recipients={bcc} onChange={setBcc} />}

          {/* Subject + Cc/Bcc toggles */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-surface-border">
            {!showCc  && <button onClick={() => setShowCc(true)}  className="text-xs text-gray-500 hover:text-gray-300">+Cc</button>}
            {!showBcc && <button onClick={() => setShowBcc(true)} className="text-xs text-gray-500 hover:text-gray-300 ml-2">+Bcc</button>}
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
              className="flex-1 bg-transparent text-sm text-gray-100 focus:outline-none ml-2 placeholder-gray-600" />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <RichEditor value={body} onChange={setBody} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-surface-border">
            <div className="flex items-center gap-2">
              <button onClick={handleSend} disabled={sending} className="btn-primary gap-2 text-xs">
                <Send size={13} />
                {sending ? 'Sending…' : 'Send'}
              </button>
              {isDraftMode && (
                <button onClick={() => doSave(false)} className="btn-ghost gap-1.5 text-xs">
                  <Save size={12} /> Save draft
                </button>
              )}
            </div>
            <button onClick={() => setCompose(null)} className="p-1.5 rounded-lg hover:bg-surface text-gray-500 hover:text-red-400 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
