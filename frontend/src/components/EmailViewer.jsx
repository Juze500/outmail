import { useState, useEffect } from 'react'
import {
  Reply, ReplyAll, Forward, Trash2, Flag, Star, MoreHorizontal,
  Paperclip, Download, X, ChevronDown, Mail, ArrowLeft
} from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../store/useMailStore'
import { deleteEmail, flagEmail, markRead, getAttachments } from '../api/mail'
import Spinner from './ui/Spinner'

function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function Avatar({ name, email }) {
  const letter = (name || email || '?')[0].toUpperCase()
  return (
    <div className="w-9 h-9 rounded-full bg-[#0078D4]/20 text-[#0078D4] text-sm font-bold flex items-center justify-center flex-shrink-0">
      {letter}
    </div>
  )
}

export default function EmailViewer() {
  const { openEmail, loadingEmail, setCompose, removeEmailLocal, toggleFlagLocal, markReadLocal } = useMailStore()
  const [attachments, setAttachments]       = useState(null)
  const [loadingAttach, setLoadingAttach]   = useState(false)
  const [showAllHeaders, setShowAllHeaders] = useState(false)

  // Load attachments when email has them
  useEffect(() => {
    setAttachments(null)
    setShowAllHeaders(false)
    if (openEmail?.has_attachments) {
      setLoadingAttach(true)
      getAttachments(openEmail.id)
        .then(data => setAttachments(data.attachments ?? []))
        .catch(() => {})
        .finally(() => setLoadingAttach(false))
    }
  }, [openEmail?.id])

  if (!openEmail) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e2e]">
        <div className="text-center">
          <Mail size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Select an email to read</p>
        </div>
      </div>
    )
  }

  async function handleDelete() {
    try {
      await deleteEmail(openEmail.id)
      removeEmailLocal(openEmail.id)
      toast.success('Moved to Deleted Items.')
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to delete.')
    }
  }

  async function handleFlag() {
    const nowFlagged = !openEmail.flagged
    toggleFlagLocal(openEmail.id, nowFlagged)
    try {
      await flagEmail(openEmail.id, nowFlagged)
    } catch {
      toggleFlagLocal(openEmail.id, !nowFlagged)
      toast.error('Failed to update flag.')
    }
  }

  async function handleMarkUnread() {
    markReadLocal(openEmail.id, false)
    markRead(openEmail.id, false).catch(() => {})
  }

  function downloadAttachment(att) {
    // Microsoft Graph attachment download — open in new tab
    toast('Attachment download requires Graph API file endpoint.')
  }

  const body = openEmail.body

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e2e]">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b border-[#3a3a52] bg-[#1e1e2e]">
        <button onClick={() => setCompose({ mode: 'reply', email: openEmail })}
          className="btn-ghost text-xs gap-1.5">
          <Reply size={14} /> Reply
        </button>
        <button onClick={() => setCompose({ mode: 'replyAll', email: openEmail })}
          className="btn-ghost text-xs gap-1.5">
          <ReplyAll size={14} /> Reply All
        </button>
        <button onClick={() => setCompose({ mode: 'forward', email: openEmail })}
          className="btn-ghost text-xs gap-1.5">
          <Forward size={14} /> Forward
        </button>

        <div className="flex-1" />

        <button onClick={handleMarkUnread} title="Mark unread"
          className="p-2 rounded-lg hover:bg-[#2a2a3d] text-gray-500 hover:text-white transition-colors">
          <Mail size={14} />
        </button>
        <button onClick={handleFlag} title={openEmail.flagged ? 'Unflag' : 'Flag'}
          className={`p-2 rounded-lg hover:bg-[#2a2a3d] transition-colors ${openEmail.flagged ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}>
          <Star size={14} className={openEmail.flagged ? 'fill-yellow-400' : ''} />
        </button>
        <button onClick={handleDelete} title="Delete"
          className="p-2 rounded-lg hover:bg-[#2a2a3d] text-gray-500 hover:text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Email content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {/* Subject */}
          <h1 className="text-xl font-semibold text-white mb-4 leading-tight">
            {openEmail.subject || '(No subject)'}
          </h1>

          {/* From / date header */}
          <div className="flex items-start gap-3 mb-4">
            <Avatar name={openEmail.sender_name} email={openEmail.sender_email} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-white">{openEmail.sender_name || openEmail.sender_email}</span>
                {openEmail.sender_name && (
                  <span className="text-xs text-gray-500">&lt;{openEmail.sender_email}&gt;</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{fmt(openEmail.received_at)}</span>
                {openEmail.importance === 'high' && (
                  <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-semibold uppercase">High Priority</span>
                )}
              </div>
              {/* Recipients */}
              <button
                onClick={() => setShowAllHeaders(!showAllHeaders)}
                className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-400 mt-0.5 transition-colors"
              >
                <span>To: {openEmail.body?.headers ? 'Recipients' : 'you'}</span>
                <ChevronDown size={10} className={`transition-transform ${showAllHeaders ? 'rotate-180' : ''}`} />
              </button>
              {showAllHeaders && openEmail.body?.headers && (
                <div className="mt-2 text-[11px] text-gray-500 space-y-0.5 bg-[#2a2a3d] rounded-lg p-3">
                  {openEmail.body.headers.slice(0, 10).map((h, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-600 flex-shrink-0">{h.name}:</span>
                      <span className="break-all">{h.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Attachments */}
          {openEmail.has_attachments && (
            <div className="mb-4 p-3 bg-[#2a2a3d] border border-[#3a3a52] rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Paperclip size={13} className="text-gray-500" />
                <span className="text-xs font-medium text-gray-400">Attachments</span>
              </div>
              {loadingAttach ? (
                <Spinner size={16} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(attachments ?? []).filter(a => !a.isInline).map(att => (
                    <div key={att.id} className="flex items-center gap-2 bg-[#1e1e2e] border border-[#3a3a52] rounded-lg px-3 py-2">
                      <Paperclip size={12} className="text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-300 font-medium">{att.name}</p>
                        <p className="text-[10px] text-gray-600">{(att.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button onClick={() => downloadAttachment(att)}
                        className="p-1 rounded hover:bg-[#2a2a3d] text-gray-500 hover:text-white transition-colors">
                        <Download size={12} />
                      </button>
                    </div>
                  ))}
                  {attachments?.length === 0 && (
                    <p className="text-xs text-gray-600">No downloadable attachments.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Body */}
          {loadingEmail ? (
            <div className="flex justify-center py-12"><Spinner size={24} /></div>
          ) : body?.body_html ? (
            <div className="rounded-xl overflow-hidden border border-[#3a3a52]">
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                  body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#d1d5db;background:#1e1e2e;padding:16px;margin:0}
                  a{color:#60a5fa}img{max-width:100%;height:auto}
                  table{max-width:100%;border-collapse:collapse}
                </style></head><body>${body.body_html}</body></html>`}
                className="w-full min-h-[400px]"
                style={{ border: 'none', background: '#1e1e2e' }}
                onLoad={e => {
                  const doc = e.target.contentDocument
                  if (doc) {
                    e.target.style.height = doc.body.scrollHeight + 32 + 'px'
                  }
                }}
                sandbox="allow-same-origin"
                title="Email body"
              />
            </div>
          ) : body?.body_text ? (
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
              {body.body_text}
            </pre>
          ) : (
            <p className="text-sm text-gray-600 italic">No content to display.</p>
          )}
        </div>
      </div>
    </div>
  )
}
