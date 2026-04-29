/**
 * BulkComposeStep
 *
 * Rich email compose step for the bulk-send wizard.
 *
 * Features:
 *   • Subject line with inline variable picker
 *   • Body editor — three tab modes:
 *       Visual  — contentEditable with formatting toolbar
 *       HTML    — raw HTML/CSS code editor (paste your full template)
 *       Preview — rendered output with variables resolved from a sample recipient
 *   • Variable chips panel: click to insert {{key}} at current cursor
 *   • Batch settings (collapsible)
 *   • Per-recipient template resolution happens at send time in the store
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, Link2, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Code2, Eraser, ChevronDown,
  ChevronLeft, Settings2, ArrowDownToLine, Users, Eye, Braces,
  Minus, Type, Send,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { tryDecodeBase64, resolveTemplate } from '../../utils/templateUtils'

// ── Constants ─────────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDelay(ms) {
  if (!ms)          return 'No delay'
  if (ms < 60000)   return `${ms / 1000}s`
  if (ms < 3600000) return `${ms / 60000}m`
  return `${ms / 3600000}h`
}

// resolveTemplate is imported from templateUtils — see top of file.

// ── Sub-components ────────────────────────────────────────────────────────────

/** Single toolbar button — uses onMouseDown to avoid stealing focus. */
function TB({ title, active, onClick, children, className = '' }) {
  return (
    <button
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={`p-1.5 rounded text-xs transition-colors flex-shrink-0 ${
        active
          ? 'bg-brand/20 text-brand'
          : 'text-gray-400 hover:bg-surface hover:text-white'
      } ${className}`}
    >{children}</button>
  )
}

function TBSep() { return <div className="w-px h-3.5 bg-surface-border mx-0.5 self-center flex-shrink-0" /> }

/** Hidden color input triggered programmatically. */
function ColorPicker({ inputRef, onPick, title, children }) {
  return (
    <span className="relative flex-shrink-0">
      <button
        title={title}
        onMouseDown={e => { e.preventDefault(); inputRef.current?.click() }}
        className="p-1.5 rounded text-xs text-gray-400 hover:bg-surface hover:text-white transition-colors"
      >{children}</button>
      <input
        ref={inputRef}
        type="color"
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        onChange={e => onPick(e.target.value)}
      />
    </span>
  )
}

/** Variable chip — onMouseDown prevents stealing focus from the editor. */
function VarChip({ varKey, onInsert, label = null, dim = false }) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onInsert(varKey) }}
      title={`Insert {{${varKey}}}`}
      className={`flex items-center gap-1 text-[10px] font-mono rounded px-2 py-1 transition-colors whitespace-nowrap border ${
        dim
          ? 'bg-surface border-surface-border text-gray-500 hover:bg-surface-raised hover:text-gray-300'
          : 'bg-brand/10 text-brand/80 border-brand/20 hover:bg-brand/20 hover:text-brand'
      }`}
    >
      {`{{${varKey}}}`}
      {label && <span className={`text-[9px] font-sans font-medium ${dim ? 'text-gray-600' : 'text-brand/50'}`}>{label}</span>}
    </button>
  )
}

// ── Formatting toolbar ────────────────────────────────────────────────────────
function EditorToolbar({ exec, colorRef, bgColorRef }) {
  const [showFontSize, setShowFontSize] = useState(false)
  const [showHeading,  setShowHeading]  = useState(false)

  const HEADINGS = [
    { label: 'Paragraph', cmd: 'formatBlock', val: 'p'  },
    { label: 'Heading 1', cmd: 'formatBlock', val: 'h1' },
    { label: 'Heading 2', cmd: 'formatBlock', val: 'h2' },
    { label: 'Heading 3', cmd: 'formatBlock', val: 'h3' },
  ]
  const SIZES = [
    { label: 'Small',   val: '1' },
    { label: 'Normal',  val: '3' },
    { label: 'Large',   val: '5' },
    { label: 'Huge',    val: '6' },
  ]

  function handleLink() {
    const url = window.prompt('Enter URL:')
    if (url) exec('createLink', url)
  }

  return (
    <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-surface-border bg-surface-raised/50 rounded-t-lg">
      {/* Text formatting */}
      <TB title="Bold (Ctrl+B)"          onClick={() => exec('bold')}          ><Bold          size={12} /></TB>
      <TB title="Italic (Ctrl+I)"        onClick={() => exec('italic')}        ><Italic        size={12} /></TB>
      <TB title="Underline (Ctrl+U)"     onClick={() => exec('underline')}     ><Underline     size={12} /></TB>
      <TB title="Strikethrough"          onClick={() => exec('strikeThrough')} ><Strikethrough size={12} /></TB>
      <TBSep />

      {/* Heading picker */}
      <span className="relative flex-shrink-0">
        <button
          title="Paragraph / Heading"
          onMouseDown={e => { e.preventDefault(); setShowHeading(o => !o); setShowFontSize(false) }}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-surface hover:text-white transition-colors"
        >
          <Type size={11} />
          <ChevronDown size={9} />
        </button>
        {showHeading && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-surface-raised border border-surface-border rounded-lg shadow-xl py-1 min-w-[120px]">
            {HEADINGS.map(h => (
              <button
                key={h.val}
                onMouseDown={e => { e.preventDefault(); exec(h.cmd, h.val); setShowHeading(false) }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-raised hover:text-white transition-colors"
              >{h.label}</button>
            ))}
          </div>
        )}
      </span>

      {/* Font size picker */}
      <span className="relative flex-shrink-0">
        <button
          title="Font size"
          onMouseDown={e => { e.preventDefault(); setShowFontSize(o => !o); setShowHeading(false) }}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-surface hover:text-white transition-colors"
        >
          Aa <ChevronDown size={9} />
        </button>
        {showFontSize && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-surface-raised border border-surface-border rounded-lg shadow-xl py-1 min-w-[90px]">
            {SIZES.map(s => (
              <button
                key={s.val}
                onMouseDown={e => { e.preventDefault(); exec('fontSize', s.val); setShowFontSize(false) }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-raised hover:text-white transition-colors"
              >{s.label}</button>
            ))}
          </div>
        )}
      </span>

      <TBSep />

      {/* Colors */}
      <ColorPicker inputRef={colorRef} title="Text color"
        onPick={v => exec('foreColor', v)}
      >
        <span className="flex items-center gap-0.5">
          <span className="text-[11px] font-bold text-gray-300">A</span>
          <span className="w-2.5 h-0.5 bg-current rounded" />
        </span>
      </ColorPicker>

      <ColorPicker inputRef={bgColorRef} title="Highlight color"
        onPick={v => exec('backColor', v)}
      >
        <span className="flex items-center gap-0.5">
          <span className="w-3 h-3 rounded-sm bg-yellow-400/60 border border-yellow-400/40" />
        </span>
      </ColorPicker>

      <TBSep />

      {/* Link + horizontal rule */}
      <TB title="Insert link"         onClick={handleLink}                    ><Link2   size={12} /></TB>
      <TB title="Horizontal rule"     onClick={() => exec('insertHorizontalRule')}><Minus size={12} /></TB>

      <TBSep />

      {/* Lists */}
      <TB title="Bullet list"         onClick={() => exec('insertUnorderedList')} ><List         size={12} /></TB>
      <TB title="Numbered list"       onClick={() => exec('insertOrderedList')}   ><ListOrdered  size={12} /></TB>

      <TBSep />

      {/* Alignment */}
      <TB title="Align left"          onClick={() => exec('justifyLeft')}    ><AlignLeft   size={12} /></TB>
      <TB title="Align center"        onClick={() => exec('justifyCenter')}  ><AlignCenter size={12} /></TB>
      <TB title="Align right"         onClick={() => exec('justifyRight')}   ><AlignRight  size={12} /></TB>

      <TBSep />

      {/* Clear */}
      <TB title="Clear formatting"    onClick={() => exec('removeFormat')}   ><Eraser size={12} /></TB>
    </div>
  )
}

// ── Main compose component ────────────────────────────────────────────────────
export default function BulkComposeStep({
  recipients,
  accounts,
  accountId,    setAccountId,
  subject,      setSubject,
  body,         setBody,
  batchSize,    setBatchSize,
  batchDelay,   setBatchDelay,
  base64Fields, // string[] — fields whose stored values are base64-encoded
  onBack,
  onSend,
}) {
  const b64Set = new Set(base64Fields ?? [])
  const [editorMode,    setEditorMode]    = useState('visual')  // 'visual'|'html'|'preview'
  const [htmlSource,    setHtmlSource]    = useState(body || '')
  const [showVars,      setShowVars]      = useState(true)
  const [showConfig,    setShowConfig]    = useState(false)
  const [activeField,   setActiveField]   = useState('body')
  const [previewIdx,    setPreviewIdx]    = useState(0)

  const editorRef    = useRef(null)
  const subjectRef   = useRef(null)
  const colorRef     = useRef(null)
  const bgColorRef   = useRef(null)

  // All available variable keys (from first recipient's data, excluding 'email')
  const vars = recipients.length > 0
    ? Object.keys(recipients[0].data).filter(k => k.toLowerCase() !== 'email')
    : []

  const previewRecipient = recipients[previewIdx] ?? null

  // ── Mode switching — sync Visual ↔ HTML ─────────────────────────────────
  function switchMode(newMode) {
    if (newMode === editorMode) return
    // Capture current editor state before switching
    if (editorMode === 'visual') {
      const html = editorRef.current?.innerHTML ?? ''
      setHtmlSource(html)
      setBody(html)
    } else if (editorMode === 'html') {
      if (editorRef.current) editorRef.current.innerHTML = htmlSource
      setBody(htmlSource)
    }
    setEditorMode(newMode)
  }

  // Sync visual editor content on first mount or when switching back to visual
  useEffect(() => {
    if (editorMode === 'visual' && editorRef.current) {
      if (!editorRef.current.innerHTML && body) {
        editorRef.current.innerHTML = body
      }
    }
  }, [editorMode]) // eslint-disable-line

  // ── execCommand wrapper ─────────────────────────────────────────────────
  const exec = useCallback((cmd, val = null) => {
    document.execCommand(cmd, false, val)
    if (editorRef.current) setBody(editorRef.current.innerHTML)
    editorRef.current?.focus()
  }, [setBody])

  // ── Variable insertion ───────────────────────────────────────────────────
  function insertVar(key) {
    const token = `{{${key}}}`

    if (activeField === 'subject') {
      const el = subjectRef.current
      if (!el) { setSubject(prev => prev + token); return }
      const s = el.selectionStart ?? subject.length
      const e = el.selectionEnd   ?? subject.length
      const next = subject.slice(0, s) + token + subject.slice(e)
      setSubject(next)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + token.length
        el.focus()
      })
    } else {
      // Body field
      if (editorMode === 'html') {
        const next = htmlSource + token
        setHtmlSource(next)
        setBody(next)
      } else {
        // Insert at current selection in contentEditable
        editorRef.current?.focus()
        document.execCommand('insertText', false, token)
        if (editorRef.current) setBody(editorRef.current.innerHTML)
      }
    }
  }

  // ── HTML source change ───────────────────────────────────────────────────
  function handleHtmlChange(val) {
    setHtmlSource(val)
    setBody(val)
  }

  // ── Visual editor input ──────────────────────────────────────────────────
  function handleEditorInput(e) {
    setBody(e.currentTarget.innerHTML)
  }

  // ── Send ────────────────────────────────────────────────────────────────
  function handleSend() {
    if (!accountId)         { toast.error('Select a sending account.'); return }
    if (!subject.trim())    { toast.error('Subject is required.'); return }
    const currentBody = editorMode === 'html' ? htmlSource : (editorRef.current?.innerHTML ?? body)
    if (!currentBody.trim()) { toast.error('Message body is required.'); return }
    // Sync body one last time
    if (editorMode === 'visual' && editorRef.current) setBody(editorRef.current.innerHTML)
    else if (editorMode === 'html') setBody(htmlSource)
    onSend()
  }

  const totalBatches = Math.ceil(recipients.length / batchSize)
  const hasVars = vars.length > 0

  // Preview HTML with resolved variables (uses fuzzy resolver + b64 decoding)
  const currentBodySrc = editorMode === 'html' ? htmlSource : (body || '')
  const previewHtml = previewRecipient
    ? resolveTemplate(currentBodySrc, previewRecipient.data, b64Set)
    : currentBodySrc

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Users size={12} />
          <strong className="text-white">{recipients.length}</strong> recipient{recipients.length !== 1 ? 's' : ''}
          <span className="text-gray-600">· {totalBatches} batch{totalBatches !== 1 ? 'es' : ''}</span>
        </p>
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-white flex items-center gap-1">
          <ChevronLeft size={12} /> Edit list
        </button>
      </div>

      {/* From */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 w-14 flex-shrink-0">From</label>
        <select
          value={accountId ?? ''}
          onChange={e => setAccountId(parseInt(e.target.value))}
          className="flex-1 bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
        >
          {accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
        </select>
      </div>

      {/* Subject */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 w-14 flex-shrink-0">Subject</label>
        <div className="flex-1 relative">
          <input
            ref={subjectRef}
            value={subject}
            onChange={e => setSubject(e.target.value)}
            onFocus={() => setActiveField('subject')}
            placeholder={hasVars ? 'e.g. Your login code is {{code}}' : 'Email subject…'}
            className="w-full bg-surface border border-surface-border rounded-lg pl-3 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* Variable picker */}
      {hasVars && (
        <div className="border border-surface-border rounded-xl overflow-hidden">
          <button
            onMouseDown={e => { e.preventDefault(); setShowVars(o => !o) }}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:bg-surface-raised transition-colors"
          >
            <span className="flex items-center gap-2">
              <Braces size={12} className="text-brand/60" />
              <span>Variables <span className="text-gray-600">({vars.length} available from your data)</span></span>
              {activeField === 'subject'
                ? <span className="text-[10px] text-brand/60">→ inserting into Subject</span>
                : <span className="text-[10px] text-brand/60">→ inserting into Body</span>
              }
            </span>
            <ChevronDown size={11} className={`transition-transform ${showVars ? 'rotate-180' : ''}`} />
          </button>
          {showVars && (
            <div className="px-3 pb-3 pt-1 border-t border-surface-border bg-surface-raised/30">
              <p className="text-[10px] text-gray-600 mb-2">
                Click a variable to insert it at the cursor position in the {activeField === 'subject' ? 'subject' : 'body'}.
                First-recipient preview: <span className="text-gray-400 font-mono">{previewRecipient?.email}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {vars.map(k => {
                  const isB64   = b64Set.has(k)
                  const rawVal  = previewRecipient?.data[k]
                  const dispVal = rawVal !== undefined
                    ? (isB64 ? (tryDecodeBase64(String(rawVal)) ?? String(rawVal)) : String(rawVal))
                    : null

                  return (
                    <div key={k} className="flex items-start gap-1 group">
                      <div className="flex flex-col gap-0.5">
                        {/* Primary chip — auto-decoded for b64 fields */}
                        <VarChip
                          varKey={k}
                          onInsert={insertVar}
                          label={isB64 ? 'decoded' : null}
                        />
                        {/* Raw chip — only shown for base64 fields */}
                        {isB64 && (
                          <VarChip
                            varKey={`${k}:raw`}
                            onInsert={insertVar}
                            label="raw b64"
                            dim
                          />
                        )}
                      </div>
                      {/* Sample value preview */}
                      {dispVal !== null && (
                        <span
                          className="text-[9px] text-gray-600 group-hover:text-gray-400 transition-colors max-w-[100px] truncate self-center mt-0.5"
                          title={dispVal}
                        >
                          = {dispVal.slice(0, 18)}{dispVal.length > 18 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Body editor */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-gray-500">Message</label>
          {/* Mode tabs */}
          <div className="flex items-center gap-0 bg-surface border border-surface-border rounded-lg p-0.5">
            {[
              { id: 'visual',   icon: <Bold size={10} />,   label: 'Visual'   },
              { id: 'html',     icon: <Code2 size={10} />,  label: 'HTML'     },
              { id: 'preview',  icon: <Eye size={10} />,    label: 'Preview'  },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => switchMode(m.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  editorMode === m.id
                    ? 'bg-brand/20 text-brand'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Visual mode */}
        {editorMode === 'visual' && (
          <div className="border border-surface-border rounded-lg overflow-hidden">
            <EditorToolbar exec={exec} colorRef={colorRef} bgColorRef={bgColorRef} />
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onFocus={() => setActiveField('body')}
              className="min-h-[200px] max-h-[320px] overflow-y-auto text-sm text-gray-100 p-3 focus:outline-none"
              style={{ lineHeight: 1.7 }}
            />
          </div>
        )}

        {/* HTML mode — paste raw HTML/CSS template */}
        {editorMode === 'html' && (
          <div className="border border-surface-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised/50 border-b border-surface-border">
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Code2 size={10} /> Raw HTML / CSS — paste your full email template here
              </span>
              <span className="text-[10px] text-gray-600">Use <span className="font-mono text-brand/70">{'{{variable}}'}</span> for personalisation</span>
            </div>
            <textarea
              value={htmlSource}
              onChange={e => handleHtmlChange(e.target.value)}
              onFocus={() => setActiveField('body')}
              placeholder={'<!DOCTYPE html>\n<html>\n<head><style>body { font-family: Arial; }</style></head>\n<body>\n  <h1>Hello!</h1>\n  <p>Your code is {{code}}</p>\n</body>\n</html>'}
              className="w-full min-h-[240px] max-h-[360px] bg-surface text-sm text-gray-300 font-mono p-3 focus:outline-none resize-y border-none"
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview mode — renders the email with first recipient's variables */}
        {editorMode === 'preview' && (
          <div className="border border-surface-border rounded-lg overflow-hidden">
            {/* Preview toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised/50 border-b border-surface-border">
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Eye size={10} /> Rendered preview
                {previewRecipient && (
                  <span className="ml-1 text-gray-600">— variables resolved for <span className="text-gray-400">{previewRecipient.email}</span></span>
                )}
              </span>
              {recipients.length > 1 && (
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <span>Recipient:</span>
                  <button
                    onClick={() => setPreviewIdx(i => Math.max(0, i - 1))}
                    disabled={previewIdx === 0}
                    className="px-1.5 py-0.5 rounded hover:bg-surface disabled:opacity-30 transition-colors"
                  >‹</button>
                  <span className="text-gray-400">{previewIdx + 1} / {recipients.length}</span>
                  <button
                    onClick={() => setPreviewIdx(i => Math.min(recipients.length - 1, i + 1))}
                    disabled={previewIdx === recipients.length - 1}
                    className="px-1.5 py-0.5 rounded hover:bg-surface disabled:opacity-30 transition-colors"
                  >›</button>
                </div>
              )}
            </div>

            {/* Subject preview */}
            {subject && (
              <div className="px-4 py-2 border-b border-surface-border/50 bg-surface-raised/20">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-2">Subject</span>
                <span className="text-sm text-gray-200"
                  dangerouslySetInnerHTML={{ __html: previewRecipient
                    ? resolveTemplate(subject, previewRecipient.data, b64Set)
                    : subject
                  }}
                />
              </div>
            )}

            {/* Body preview */}
            <div
              className="min-h-[200px] max-h-[360px] overflow-y-auto p-4 text-sm text-gray-200 bg-white/[0.02]"
              style={{ lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-gray-600 italic">Nothing to preview yet.</p>' }}
            />

            {!previewRecipient && (
              <div className="px-4 py-2 border-t border-surface-border/50 text-[10px] text-yellow-400/70 flex items-center gap-1">
                ⚠ No recipient data — variable placeholders will show as highlighted tokens.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Batch settings */}
      <div className="border border-surface-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowConfig(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-400 hover:bg-surface-raised transition-colors"
        >
          <span className="flex items-center gap-2">
            <Settings2 size={12} />
            Batch settings
            <span className="text-gray-600">— {batchSize}/batch · {fmtDelay(batchDelay)} between batches</span>
          </span>
          <ChevronDown size={11} className={`transition-transform ${showConfig ? 'rotate-180' : ''}`} />
        </button>
        {showConfig && (
          <div className="px-4 pb-4 pt-1 border-t border-surface-border space-y-4 bg-surface-raised">
            <div>
              <p className="text-[11px] text-gray-500 mb-2">Emails per batch</p>
              <div className="flex gap-1.5 flex-wrap">
                {BATCH_SIZES.map(n => (
                  <button key={n} onClick={() => setBatchSize(n)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      batchSize === n ? 'bg-brand/20 text-brand' : 'text-gray-500 hover:bg-surface hover:text-white'
                    }`}
                  >{n}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 mb-2">Delay between batches</p>
              <div className="grid grid-cols-6 gap-1.5">
                {BATCH_DELAYS.map(d => (
                  <button key={d.value} onClick={() => setBatchDelay(d.value)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-medium text-center transition-colors ${
                      batchDelay === d.value ? 'bg-brand/20 text-brand' : 'text-gray-500 hover:bg-surface hover:text-white'
                    }`}
                  >{d.label}</button>
                ))}
              </div>
              {batchDelay >= 60000 && (
                <p className="text-[10px] text-yellow-400/80 mt-2 flex items-center gap-1">
                  <ArrowDownToLine size={10} />
                  Long delay — use "Send in background" to close the modal while sending continues.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onBack} className="btn-ghost text-xs">Back</button>
        <button onClick={handleSend} className="btn-primary gap-2 text-xs">
          <Send size={12} />
          Send to {recipients.length} recipient{recipients.length !== 1 ? 's' : ''} in {totalBatches} batch{totalBatches !== 1 ? 'es' : ''}
        </button>
      </div>
    </div>
  )
}
