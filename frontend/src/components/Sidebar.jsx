import { useState, useEffect } from 'react'
import {
  Inbox, Send, FileText, Trash2, AlertCircle, Folder,
  ChevronDown, ChevronRight, Plus, RefreshCw, Link2, LogOut, User
} from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../store/useMailStore'
import useAuthStore from '../store/useAuthStore'
import { getAccounts, getFolders, getMicrosoftRedirectUrl, deleteAccount } from '../api/mail'
import Spinner from './ui/Spinner'

const FOLDER_ICONS = {
  inbox:        Inbox,
  sentitems:    Send,
  drafts:       FileText,
  deleteditems: Trash2,
  junkemail:    AlertCircle,
}

function folderIcon(name) {
  const key = name?.toLowerCase().replace(/[^a-z]/g, '')
  return FOLDER_ICONS[key] ?? Folder
}

function folderSortKey(name) {
  const order = { inbox: 0, drafts: 1, sentitems: 2, junkemail: 3, deleteditems: 4 }
  return order[name?.toLowerCase().replace(/[^a-z]/g, '')] ?? 99
}

export default function Sidebar() {
  const { accounts, folders, activeFolderKey, setAccounts, setFolders, setActiveFolderKey } = useMailStore()
  const { user, logout } = useAuthStore()
  const [expanded, setExpanded]   = useState({})
  const [loading,  setLoading]    = useState(false)
  const [refreshing, setRefreshing] = useState(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => { loadAccounts() }, [])

  async function loadAccounts() {
    setLoading(true)
    try {
      const data = await getAccounts()
      setAccounts(data.accounts ?? [])
      // Auto-expand first account
      if (data.accounts?.length) {
        const first = data.accounts[0]
        setExpanded({ [first.id]: true })
        loadFolders(first.id)
      }
    } catch {
      toast.error('Failed to load accounts.')
    } finally {
      setLoading(false)
    }
  }

  async function loadFolders(accountId, force = false) {
    if (!force && folders[accountId]) return
    if (force) setRefreshing(accountId)
    try {
      const data = await getFolders(accountId, force)
      setFolders(accountId, data.folders ?? [])
    } catch {
      toast.error('Failed to load folders.')
    } finally {
      setRefreshing(null)
    }
  }

  function toggleAccount(id) {
    const next = !expanded[id]
    setExpanded(e => ({ ...e, [id]: next }))
    if (next) loadFolders(id)
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      const data = await getMicrosoftRedirectUrl()
      window.location.href = data.url
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'azure_not_configured') {
        toast.error('Azure not configured. Ask your admin to set it up in Settings.')
      } else {
        toast.error(err.response?.data?.message ?? 'OAuth failed.')
      }
      setConnecting(false)
    }
  }

  function selectFolder(accountId, folderId) {
    setActiveFolderKey(`${accountId}:${folderId}`)
  }

  return (
    <aside className="flex flex-col h-full bg-[#1e1e2e] border-r border-[#3a3a52] w-60 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#3a3a52]">
        <div className="w-7 h-7 rounded-lg bg-[#0078D4] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">M</span>
        </div>
        <span className="text-sm font-semibold text-white">Mail Manager</span>
      </div>

      {/* Accounts list */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size={20} /></div>
        ) : accounts.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-gray-500 mb-3">No accounts connected</p>
            <button onClick={handleConnect} disabled={connecting}
              className="text-xs text-[#0078D4] hover:underline flex items-center gap-1 mx-auto">
              <Plus size={12} /> Connect Outlook
            </button>
          </div>
        ) : accounts.map(account => (
          <div key={account.id} className="mb-1">
            {/* Account row */}
            <button
              onClick={() => toggleAccount(account.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#2a2a3d] transition-colors group"
            >
              <div className="w-6 h-6 rounded-full bg-[#0078D4]/20 text-[#0078D4] text-[10px] font-bold uppercase flex items-center justify-center flex-shrink-0">
                {account.email?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate">{account.email}</p>
                {account.is_primary && <p className="text-[10px] text-gray-600">Primary</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {refreshing === account.id
                  ? <Spinner size={12} />
                  : <button onClick={e => { e.stopPropagation(); loadFolders(account.id, true) }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-white text-gray-500 transition-all">
                      <RefreshCw size={11} />
                    </button>
                }
                {expanded[account.id] ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />}
              </div>
            </button>

            {/* Folders */}
            {expanded[account.id] && (
              <div className="ml-2">
                {(folders[account.id] ?? [])
                  .slice()
                  .sort((a, b) => folderSortKey(a.display_name) - folderSortKey(b.display_name))
                  .map(folder => {
                    const key    = `${account.id}:${folder.graph_folder_id}`
                    const active = activeFolderKey === key
                    const Icon   = folderIcon(folder.display_name)
                    return (
                      <button
                        key={folder.id}
                        onClick={() => selectFolder(account.id, folder.graph_folder_id)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-lg mx-1 text-xs transition-colors ${
                          active
                            ? 'bg-[#0078D4]/20 text-[#0078D4] font-medium'
                            : 'text-gray-400 hover:bg-[#2a2a3d] hover:text-gray-200'
                        }`}
                      >
                        <Icon size={13} className="flex-shrink-0" />
                        <span className="flex-1 truncate">{folder.display_name}</span>
                        {folder.unread_items > 0 && (
                          <span className="text-[10px] bg-[#0078D4] text-white rounded-full px-1.5 py-0.5 font-semibold">
                            {folder.unread_items > 99 ? '99+' : folder.unread_items}
                          </span>
                        )}
                      </button>
                    )
                  })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-[#3a3a52] p-3 space-y-1">
        <button onClick={handleConnect} disabled={connecting}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:bg-[#2a2a3d] hover:text-white transition-colors">
          <Link2 size={13} />
          {connecting ? 'Redirecting…' : 'Connect account'}
        </button>
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold uppercase flex items-center justify-center flex-shrink-0">
            {user?.name?.[0]}
          </div>
          <p className="flex-1 text-xs text-gray-400 truncate">{user?.name}</p>
          <button onClick={logout} title="Sign out"
            className="p-1 rounded hover:bg-[#3a3a52] text-gray-600 hover:text-red-400 transition-colors">
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}
