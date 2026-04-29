import { useState, useEffect, useRef } from 'react'
import { X, ChevronDown, ChevronUp, Minus, Maximize2, Send, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../store/useMailStore'
import useAuthStore from '../store/useAuthStore'
import { sendEmail, replyEmail, forwardEmail } from '../api/mail'

// Simple rich-text via contentEditable with execCommand
function RichEditor({ value, onChange, placeholder = 'Write your message…' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value
    }
  }, [])

  return (
    <div className="relative flex-1">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={e => onChange(e.currentTarget.innerHTML)}
        className="min-h-[180px] text-sm text-gray-100 p-3 focus:outline-none"
        style={{ lineHeight: '1.6' }}
      />
      {!value && (
        <p className="absolute top-3 left-3 text-sm text-gray-600 pointer-events-none">{placeholder}</p>
      )}
    </div>
  )
}

// Recipient pill input
function RecipientInput({ label, recipients, onChange }) {
  const [input, setInput] = useState('')

  function add() {
    const email = input.trim()
    if (!email) return
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(email)) { toast.error(`Invalid email: ${email}`); return }
    onChange([...recipients, { email, name: '' }])
    setInput('')
  }

  function remove(i) {
    onChange(recipients.filter((_, idx) => idx !== i))
  }

  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-[#3a3a52] min-h-[36px]">
      <span className="text-xs text-gray-500 mt-1 w-8 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap items-center gap-1 flex-1">
        {recipients.map((r, i) => (
          <span key={i} className="flex items-center gap-1 bg-[#3a3a52] text-gray-300 text-xs rounded px-2 py-0.5">
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

export default function ComposeModal() {
  const { compose, setCompose, accounts } = useMailStore()
  const user = useAuthStore(s => s.user)

  const [accountId, setAccountId] = useState(null)
  const [to,        setTo]        = useState([])
  const [cc,        setCc]        = useState([])
  const [bcc,       setBcc]       = useState([])
  const [subject,   setSubject]   = useState('')
  const [body,      setBody]      = useState('')
  const [showCc,    setShowCc]    = useState(false)
  const [showBcc,   setShowBcc]   = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [sending,   setSending]   = useState(false)

  // Pre-fill on open
  useEffect(() => {
    if (!compose) return

    // Default to first account
    const firstAcct = accounts[0]
    setAccountId(firstAcct?.id ?? null)
    setShowCc(false); setShowBcc(false); setMinimized(false)

    const { mode, email } = compose

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
      // cc would need actual cc recipients from the email — we'll leave empty for now
      setCc([]); setBcc([])
      setSubject(`Re: ${email.subject || ''}`)
      setBody(buildQuote(email))
    }

    if (mode === 'forward') {
      setTo([]); setCc([]); setBcc([])
      setSubject(`Fwd: ${email.subject || ''}`)
      setBody(buildForwardQuote(email))
    }
  }, [compose])

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

  async function handleSend() {
    if (!accountId) { toast.error('Select an account to send from.'); return }
    if (to.length === 0) { toast.error('Add at least one recipient.'); return }
    if (!subject.trim()) { toast.error('Subject is required.'); return }

    setSending(true)
    try {
      const { mode, email } = compose

      if (mode === 'reply') {
        await replyEmail(email.id, body, false)
      } else if (mode === 'replyAll') {
        await replyEmail(email.id, body, true)
      } else if (mode === 'forward') {
        await forwardEmail(email.id, body, to)
      } else {
        await sendEmail({
          account_id: accountId,
          subject,
          body,
          body_type: 'html',
          to,
          cc:  cc.length  ? cc  : undefined,
          bcc: bcc.length ? bcc : undefined,
        })
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

  const modeLabel = compose.mode === 'new' ? 'New Message'
    : compose.mode === 'reply' ? 'Reply'
    : compose.mode === 'replyAll' ? 'Reply All'
    : 'Forward'

  return (
    <div className={`fixed bottom-0 right-6 z-40 w-[580px] bg-[#2a2a3d] border border-[#3a3a52] rounded-t-xl shadow-2xl flex flex-col transition-all ${minimized ? 'h-10' : 'h-[500px]'}`}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#3a3a52] bg-[#242436] rounded-t-xl">
        <span className="text-sm font-medium text-white flex-1">{modeLabel}</span>
        <button onClick={() => setMinimized(!minimized)} className="p-1 rounded hover:bg-[#3a3a52] text-gray-500 hover:text-white transition-colors">
          {minimized ? <ChevronUp size={14} /> : <Minus size={14} />}
        </button>
        <button onClick={() => setCompose(null)} className="p-1 rounded hover:bg-[#3a3a52] text-gray-500 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>

      {!minimized && (
        <>
          {/* From selector */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#3a3a52]">
            <span className="text-xs text-gray-500 w-8 flex-shrink-0">From</span>
            <select
              value={accountId ?? ''}
              onChange={e => setAccountId(parseInt(e.target.value))}
              className="flex-1 bg-transparent text-sm text-gray-100 focus:outline-none"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id} className="bg-[#2a2a3d]">{a.email}</option>
              ))}
            </select>
          </div>

          <RecipientInput label="To"  recipients={to}  onChange={setTo} />

          {showCc  && <RecipientInput label="Cc"  recipients={cc}  onChange={setCc} />}
          {showBcc && <RecipientInput label="Bcc" recipients={bcc} onChange={setBcc} />}

          {/* Cc/Bcc toggles + subject */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-[#3a3a52]">
            {!showCc  && <button onClick={() => setShowCc(true)}  className="text-xs text-gray-500 hover:text-gray-300">+Cc</button>}
            {!showBcc && <button onClick={() => setShowBcc(true)} className="text-xs text-gray-500 hover:text-gray-300 ml-2">+Bcc</button>}
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent text-sm text-gray-100 focus:outline-none ml-2 placeholder-gray-600"
            />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <RichEditor value={body} onChange={setBody} />
          </div>

          {/* Send bar */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-[#3a3a52]">
            <button
              onClick={handleSend}
              disabled={sending}
              className="btn-primary gap-2"
            >
              <Send size={14} />
              {sending ? 'Sending…' : 'Send'}
            </button>
            <button onClick={() => setCompose(null)} className="p-2 rounded-lg hover:bg-[#3a3a52] text-gray-500 hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
