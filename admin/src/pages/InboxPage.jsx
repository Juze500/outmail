import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  PenSquare, Users, ChevronRight, ChevronLeft,
  PanelRightClose, PanelLeftOpen,
} from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout    from '../components/layout/AdminLayout'
import MailSidebar    from '../components/mail/MailSidebar'
import MailList       from '../components/mail/MailList'
import MailViewer     from '../components/mail/MailViewer'
import MailCompose    from '../components/mail/MailCompose'
import MailMoveModal  from '../components/mail/MailMoveModal'
import MailSearch     from '../components/mail/MailSearch'
import BulkSendModal  from '../components/mail/BulkSendModal'
import KeywordManager from '../components/mail/KeywordManager'
import useMailStore      from '../store/mailStore'
import useBulkSendStore from '../store/bulkSendStore'

// ── Persist / restore layout ──────────────────────────────────────────────────
const LAYOUT_KEY  = 'inbox-layout'
const LAYOUT_DEFAULTS = {
  sidebarWidth:     224,   // px  (w-56)
  listWidth:        288,   // px  (w-72)
  sidebarCollapsed: false,
  listCollapsed:    false,
  viewerCollapsed:  false,
}

function loadLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved) return { ...LAYOUT_DEFAULTS, ...JSON.parse(saved) }
  } catch { /* ignore */ }
  return { ...LAYOUT_DEFAULTS }
}

function saveLayout(layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* ignore */ }
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Thin drag rail between two panes */
function DragHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative flex-shrink-0 z-10 cursor-col-resize"
      style={{ width: 5 }}
    >
      {/* visible line — brightens on hover/drag */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-surface-border group-hover:bg-brand/60 transition-colors" />
      {/* wider invisible hit area */}
      <div className="absolute inset-y-0 -left-2 -right-2" />
    </div>
  )
}

/** Thin vertical strip shown when a pane is collapsed */
function CollapsedStrip({ label, onExpand, flip = false }) {
  return (
    <div className="flex-shrink-0 flex flex-col items-center py-3 gap-3 select-none bg-surface border-r border-surface-border"
      style={{ width: 28 }}>
      <button
        onClick={onExpand}
        title={`Expand ${label}`}
        className="p-0.5 rounded hover:bg-surface-raised text-gray-500 hover:text-white transition-colors"
      >
        {flip ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
      </button>
      <span
        className="text-[9px] text-gray-600 uppercase tracking-widest leading-none"
        style={{ writingMode: 'vertical-rl', transform: flip ? 'rotate(0deg)' : 'rotate(180deg)' }}
      >
        {label}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setCompose, openEmail } = useMailStore()
  const { requestOpen, clearRequestOpen } = useBulkSendStore()

  const [moveOpen,  setMoveOpen]  = useState(false)
  const [bulkOpen,  setBulkOpen]  = useState(false)
  const [kwMgrOpen, setKwMgrOpen] = useState(false)

  // ── Layout state ─────────────────────────────────────────────────────────
  const [layout, setLayout] = useState(loadLayout)
  const { sidebarWidth, listWidth, sidebarCollapsed, listCollapsed, viewerCollapsed } = layout

  function patchLayout(patch) {
    setLayout(prev => {
      const next = { ...prev, ...patch }
      saveLayout(next)
      return next
    })
  }

  // ── Drag-to-resize ────────────────────────────────────────────────────────
  const dragRef = useRef(null)

  function startDrag(pane, e) {
    e.preventDefault()
    const startX     = e.clientX
    const startWidth = pane === 'sidebar' ? sidebarWidth : listWidth

    const minW = pane === 'sidebar' ? 160 : 180
    const maxW = pane === 'sidebar' ? 420 : 520

    function onMove(ev) {
      const delta    = ev.clientX - startX
      const newWidth = Math.max(minW, Math.min(maxW, startWidth + delta))
      patchLayout(pane === 'sidebar' ? { sidebarWidth: newWidth } : { listWidth: newWidth })
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      document.body.style.cursor      = ''
      document.body.style.userSelect  = ''
    }

    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }

  // ── Re-open bulk-send modal via store flag (works from any page) ───────────
  useEffect(() => {
    if (requestOpen) {
      setBulkOpen(true)
      clearRequestOpen()
    }
  }, [requestOpen]) // eslint-disable-line

  // ── URL param handling ────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('account_added') === 'true') {
      toast.success('Microsoft account connected!')
      navigate('/inbox', { replace: true })
      window.dispatchEvent(new CustomEvent('reload-mail-accounts'))
    } else if (params.get('oauth_error')) {
      toast.error('OAuth error: ' + decodeURIComponent(params.get('oauth_error')), { duration: 8000 })
      navigate('/inbox', { replace: true })
    } else if (params.get('open_account')) {
      // Navigated here from the Accounts page — signal the sidebar to open this
      // account's inbox once folders are loaded.
      const id = parseInt(params.get('open_account'), 10)
      if (id) sessionStorage.setItem('sidebar_open_inbox', String(id))
      navigate('/inbox', { replace: true })
    }
  }, []) // eslint-disable-line

  return (
    <AdminLayout title="Inbox" noPadding>
      <div className="flex h-full min-h-0 overflow-hidden">

        {/* ── Pane 1: Sidebar ────────────────────────────────────────────────── */}
        {sidebarCollapsed ? (
          <CollapsedStrip
            label="Mailboxes"
            onExpand={() => patchLayout({ sidebarCollapsed: false })}
          />
        ) : (
          <div
            className="flex-shrink-0 flex flex-col min-h-0 border-r border-surface-border"
            style={{ width: sidebarWidth }}
          >
            <MailSidebar
              onManageKeywords={() => setKwMgrOpen(true)}
              onCollapse={() => patchLayout({ sidebarCollapsed: true })}
            />
          </div>
        )}

        {/* Handle 1: between sidebar and list */}
        {!sidebarCollapsed && (
          <DragHandle onMouseDown={e => startDrag('sidebar', e)} />
        )}

        {/* ── Pane 2: Message List ────────────────────────────────────────────── */}
        {listCollapsed ? (
          <CollapsedStrip
            label="Messages"
            onExpand={() => patchLayout({ listCollapsed: false })}
          />
        ) : (
          <div
            className="flex-shrink-0 flex flex-col min-h-0 border-r border-surface-border"
            style={{ width: listWidth }}
          >
            <MailList onCollapse={() => patchLayout({ listCollapsed: true })} />
          </div>
        )}

        {/* Handle 2: between list and viewer */}
        {!listCollapsed && !viewerCollapsed && (
          <DragHandle onMouseDown={e => startDrag('list', e)} />
        )}

        {/* ── Pane 3: Reading pane ─────────────────────────────────────────────── */}
        {viewerCollapsed ? (
          <CollapsedStrip
            label="Reader"
            onExpand={() => patchLayout({ viewerCollapsed: false })}
            flip
          />
        ) : (
          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-border bg-surface flex-shrink-0">
              {/* Expand collapsed panes from here too */}
              {listCollapsed && (
                <button
                  onClick={() => patchLayout({ listCollapsed: false })}
                  title="Show message list"
                  className="p-1 rounded hover:bg-surface-raised text-gray-600 hover:text-white transition-colors flex-shrink-0"
                >
                  <PanelLeftOpen size={13} />
                </button>
              )}
              {sidebarCollapsed && (
                <button
                  onClick={() => patchLayout({ sidebarCollapsed: false })}
                  title="Show mailboxes"
                  className="p-1 rounded hover:bg-surface-raised text-gray-600 hover:text-white transition-colors flex-shrink-0"
                >
                  <PanelLeftOpen size={13} />
                </button>
              )}

              <MailSearch />
              <div className="flex-1" />

              <button
                onClick={() => setBulkOpen(true)}
                className="btn-ghost gap-1.5 text-xs"
                title="Send to an imported list of addresses"
              >
                <Users size={13} /> Bulk Send
              </button>
              <button
                onClick={() => setCompose({ mode: 'new' })}
                className="btn-primary gap-1.5 text-xs"
              >
                <PenSquare size={13} /> Compose
              </button>
              {/* Collapse viewer */}
              <button
                onClick={() => patchLayout({ viewerCollapsed: true })}
                title="Collapse reading pane"
                className="p-1 rounded hover:bg-surface-raised text-gray-600 hover:text-white transition-colors flex-shrink-0"
              >
                <PanelRightClose size={13} />
              </button>
            </div>

            {/* Email viewer */}
            <MailViewer onMoveClick={openEmail ? () => setMoveOpen(true) : null} />
          </div>
        )}
      </div>

      {/* Modals */}
      <MailCompose />
      <MailMoveModal  open={moveOpen}  onClose={() => setMoveOpen(false)} />
      <BulkSendModal  open={bulkOpen}  onClose={() => setBulkOpen(false)} />
      <KeywordManager open={kwMgrOpen} onClose={() => setKwMgrOpen(false)} />
    </AdminLayout>
  )
}
