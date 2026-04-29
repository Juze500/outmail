import { useState, useRef, useEffect } from 'react'
import { Search, X, Paperclip } from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../store/useMailStore'
import { searchEmails } from '../api/mail'
import Spinner from './ui/Spinner'

function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SearchBar() {
  const {
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    setOpenEmail, accounts,
  } = useMailStore()

  const [searching, setSearching] = useState(false)
  const timerRef = useRef(null)
  const inputRef = useRef(null)

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await searchEmails(searchQuery)
        setSearchResults(data.results ?? [])
      } catch {
        toast.error('Search failed.')
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(timerRef.current)
  }, [searchQuery])

  function clear() {
    setSearchQuery('')
    setSearchResults(null)
    inputRef.current?.focus()
  }

  function openResult(result) {
    // Map normalized search result to email-like shape for viewer
    const email = {
      id: null, // no local DB id from search — viewer will show body_preview
      graph_message_id: result.graph_message_id,
      account_id: result.account_id,
      subject: result.subject,
      sender_name: result.sender_name,
      sender_email: result.sender_email,
      received_at: result.received_at,
      is_read: result.is_read,
      has_attachments: result.has_attachments,
      body_preview: result.body_preview,
      body: { body_text: result.body_preview },
    }
    setOpenEmail(email)
    clear()
  }

  function accountEmail(accountId) {
    return accounts.find(a => a.id === accountId)?.email ?? ''
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-[#2a2a3d] border border-[#3a3a52] rounded-lg px-3 py-1.5 w-72">
        {searching
          ? <Spinner size={14} />
          : <Search size={14} className="text-gray-500 flex-shrink-0" />
        }
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search all mail…"
          className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 focus:outline-none"
        />
        {searchQuery && (
          <button onClick={clear} className="text-gray-500 hover:text-white">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {searchResults !== null && (
        <div className="absolute top-full mt-1 left-0 min-w-[420px] max-h-[480px] overflow-y-auto bg-[#2a2a3d] border border-[#3a3a52] rounded-xl shadow-2xl z-50">
          {searchResults.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-8">No results found.</p>
          ) : (
            <>
              <p className="text-[11px] text-gray-600 px-4 py-2 border-b border-[#3a3a52]">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} across all accounts
              </p>
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => openResult(r)}
                  className="w-full text-left px-4 py-3 hover:bg-[#3a3a52]/50 border-b border-[#3a3a52]/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${r.is_read ? 'bg-transparent' : 'bg-[#0078D4]'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-xs truncate ${r.is_read ? 'text-gray-400' : 'text-white font-semibold'}`}>
                          {r.sender_name || r.sender_email}
                        </span>
                        <span className="text-[10px] text-gray-600 flex-shrink-0">{fmt(r.received_at)}</span>
                      </div>
                      <p className="text-xs text-gray-300 truncate mb-0.5">{r.subject}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] text-gray-600 truncate flex-1">{r.body_preview}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {r.has_attachments && <Paperclip size={9} className="text-gray-600" />}
                          <span className="text-[9px] text-gray-600 bg-[#3a3a52] px-1.5 py-0.5 rounded truncate max-w-[100px]">
                            {accountEmail(r.account_id)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
