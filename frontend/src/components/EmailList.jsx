import { useEffect, useCallback, useRef } from 'react'
import { Paperclip, Star, Flag } from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../store/useMailStore'
import { getEmails, getEmail, markRead } from '../api/mail'
import Spinner from './ui/Spinner'

function fmt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  const diff = (now - d) / 86400000
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function EmailList() {
  const {
    emails, emailsTotal, emailsPage, loadingEmails,
    activeFolderKey, openEmail,
    setEmails, appendEmails, setEmailsPage, setLoadingEmails,
    setOpenEmail, setLoadingEmail, markReadLocal, getActiveFolder,
  } = useMailStore()

  const perPage = 50
  const sentinel = useRef(null)

  const loadPage = useCallback(async (page = 1, append = false) => {
    const active = getActiveFolder()
    if (!active) return
    setLoadingEmails(true)
    try {
      const data = await getEmails(active.accountId, active.folderId, page, perPage)
      if (append) appendEmails(data.emails, data.total)
      else        setEmails(data.emails, data.total)
      setEmailsPage(page)
    } catch {
      toast.error('Failed to load emails.')
    } finally {
      setLoadingEmails(false)
    }
  }, [activeFolderKey])

  // Reset + reload when folder changes
  useEffect(() => {
    if (activeFolderKey) loadPage(1, false)
  }, [activeFolderKey])

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadingEmails && emails.length < emailsTotal) {
        loadPage(emailsPage + 1, true)
      }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadingEmails, emails.length, emailsTotal, emailsPage])

  async function openMessage(email) {
    setOpenEmail(email)
    setLoadingEmail(true)
    // Mark as read
    if (!email.is_read) {
      markRead(email.id).catch(() => {})
      markReadLocal(email.id, true)
    }
    try {
      const data = await getEmail(email.id)
      setOpenEmail(data.email)
    } catch {
      toast.error('Failed to load email.')
    } finally {
      setLoadingEmail(false)
    }
  }

  if (!activeFolderKey) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e2e]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-[#2a2a3d] flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📭</span>
          </div>
          <p className="text-sm text-gray-500">Select a folder to view emails</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 flex-shrink-0 flex flex-col border-r border-[#3a3a52] bg-[#1e1e2e]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#3a3a52]">
        <p className="text-xs text-gray-500">{emailsTotal} messages</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loadingEmails && emails.length === 0 ? (
          <div className="flex justify-center py-12"><Spinner size={24} /></div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center px-4">
            <p className="text-sm text-gray-600">No messages in this folder</p>
          </div>
        ) : (
          <>
            {emails.map(email => {
              const active = openEmail?.id === email.id
              return (
                <button
                  key={email.id}
                  onClick={() => openMessage(email)}
                  className={`w-full text-left px-4 py-3 border-b border-[#3a3a52]/50 transition-colors
                    ${active ? 'bg-[#0078D4]/10 border-l-2 border-l-[#0078D4]' : 'hover:bg-[#2a2a3d]/50'}
                  `}
                >
                  <div className="flex items-start gap-2">
                    {/* Unread dot */}
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${email.is_read ? 'bg-transparent' : 'bg-[#0078D4]'}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs truncate ${email.is_read ? 'text-gray-400 font-normal' : 'text-white font-semibold'}`}>
                          {email.sender_name || email.sender_email || 'Unknown'}
                        </span>
                        <span className="text-[10px] text-gray-600 flex-shrink-0">{fmt(email.received_at)}</span>
                      </div>

                      <p className={`text-xs truncate mb-0.5 ${email.is_read ? 'text-gray-500' : 'text-gray-200'}`}>
                        {email.subject || '(No subject)'}
                      </p>

                      <div className="flex items-center gap-1.5">
                        <p className="text-[11px] text-gray-600 truncate flex-1">{email.body_preview}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {email.has_attachments && <Paperclip size={10} className="text-gray-600" />}
                          {email.importance === 'high' && <Flag size={10} className="text-red-400" />}
                          {email.flagged && <Star size={10} className="text-yellow-400 fill-yellow-400" />}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}

            {/* Infinite scroll sentinel */}
            <div ref={sentinel} className="py-2 flex justify-center">
              {loadingEmails && <Spinner size={16} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
