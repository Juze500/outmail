import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PenSquare, FolderInput, Menu } from 'lucide-react'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import EmailList from '../components/EmailList'
import EmailViewer from '../components/EmailViewer'
import ComposeModal from '../components/ComposeModal'
import MoveModal from '../components/MoveModal'
import SearchBar from '../components/SearchBar'
import useMailStore from '../store/useMailStore'
import useAuthStore from '../store/useAuthStore'

export default function InboxPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setCompose, openEmail, sidebarOpen, toggleSidebar } = useMailStore()
  const [moveOpen, setMoveOpen] = useState(false)

  // Handle OAuth return
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('account_added') === 'true') {
      toast.success('Microsoft account connected!')
      navigate('/', { replace: true })
      // Reload accounts sidebar
      window.dispatchEvent(new CustomEvent('reload-accounts'))
    } else if (params.get('oauth_error')) {
      toast.error('OAuth error: ' + decodeURIComponent(params.get('oauth_error')), { duration: 8000 })
      navigate('/', { replace: true })
    }
  }, []) // eslint-disable-line

  return (
    <div className="flex h-screen bg-[#1e1e2e] overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && <Sidebar />}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#3a3a52] bg-[#1e1e2e] flex-shrink-0">
          <button onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-[#2a2a3d] text-gray-500 hover:text-white transition-colors">
            <Menu size={16} />
          </button>

          <SearchBar />

          <div className="flex-1" />

          {openEmail && (
            <button onClick={() => setMoveOpen(true)} title="Move to folder"
              className="btn-ghost text-xs gap-1.5">
              <FolderInput size={14} /> Move
            </button>
          )}

          <button onClick={() => setCompose({ mode: 'new' })}
            className="btn-primary gap-2 text-xs">
            <PenSquare size={14} /> Compose
          </button>
        </div>

        {/* 2-pane layout */}
        <div className="flex flex-1 min-h-0">
          <EmailList />
          <EmailViewer />
        </div>
      </div>

      {/* Compose floating modal */}
      <ComposeModal />

      {/* Move dialog */}
      <MoveModal open={moveOpen} onClose={() => setMoveOpen(false)} />
    </div>
  )
}
