import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Trash2, AlertTriangle, RefreshCw,
  Link2, Mail, ShieldAlert, CheckCircle2,
  Inbox, Zap, Clock, AtSign,
} from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout  from '../components/layout/AdminLayout'
import Modal        from '../components/ui/Modal'
import Badge        from '../components/ui/Badge'
import Spinner      from '../components/ui/Spinner'
import Pagination   from '../components/ui/Pagination'
import EmailExtractorModal from '../components/mail/EmailExtractorModal'
import { getAccounts, deleteAccount, getUsers } from '../api/admin'
import { refreshAccountToken } from '../api/mail'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtExpiry(iso) {
  if (!iso) return '—'
  const d    = new Date(iso)
  const diff = Math.round((d - Date.now()) / 86400000)
  if (diff < 0)   return <span className="text-red-400">Expired {Math.abs(diff)}d ago</span>
  if (diff === 0) return <span className="text-yellow-400">Expires today</span>
  if (diff <= 3)  return <span className="text-yellow-400">Expires in {diff}d</span>
  return <span className="text-gray-400">{fmt(iso)}</span>
}

/** Token status badge using the string field from the API */
function TokenBadge({ status }) {
  if (status === 'valid')    return <Badge color="green">Valid</Badge>
  if (status === 'expiring') return <Badge color="yellow">Expiring</Badge>
  if (status === 'expired')  return <Badge color="red">Expired</Badge>
  return <Badge color="gray">Unknown</Badge>
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green:  'bg-green-500/10 text-green-400 border-green-500/20',
    red:    'bg-red-500/10 text-red-400 border-red-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  }
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colors[color]}`}>
      <Icon size={18} />
      <div>
        <p className="text-xl font-bold leading-none">{value ?? '—'}</p>
        <p className="text-[11px] opacity-70 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function UserAvatar({ name, size = 7 }) {
  const initials = (name ?? '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className={`w-${size} h-${size} rounded-full bg-brand/20 text-brand text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  )
}

export default function AccountsPage() {
  const navigate = useNavigate()

  const [accounts,     setAccounts]     = useState([])
  const [total,        setTotal]        = useState(0)
  const [stats,        setStats]        = useState(null)
  const [page,         setPage]         = useState(1)
  const [search,       setSearch]       = useState('')
  const [userFilter,   setUserFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading,      setLoading]      = useState(true)
  const [deleteModal,  setDeleteModal]  = useState(null)   // { id, email, userName }
  const [users,        setUsers]        = useState([])
  const [renewingId,    setRenewingId]    = useState(null)
  const [extractorAccount, setExtractorAccount] = useState(null)  // { id, email, display_name, user_name }

  const perPage = 20

  // Load flat user list once for the filter dropdown
  useEffect(() => {
    getUsers({ per_page: 200 })
      .then(d => setUsers(d.users ?? []))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { search, page, per_page: perPage }
      if (userFilter)   params.user_id = userFilter
      if (statusFilter) params.status  = statusFilter
      const data = await getAccounts(params)
      setAccounts(data.accounts)
      setTotal(data.total)
      if (data.stats) setStats(data.stats)
    } catch {
      toast.error('Failed to load accounts.')
    } finally {
      setLoading(false)
    }
  }, [search, page, userFilter, statusFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, userFilter, statusFilter])

  const handleDelete = async () => {
    if (!deleteModal) return
    try {
      await deleteAccount(deleteModal.id)
      toast.success(`Account revoked for ${deleteModal.userName}.`)
      setDeleteModal(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to revoke account.')
    }
  }

  const handleRenew = async (a) => {
    setRenewingId(a.id)
    try {
      const res = await refreshAccountToken(a.id)
      if (res.needs_reconnect) {
        toast.error(
          `Refresh token expired for ${a.email}. The user needs to reconnect this account.`,
          { duration: 8000 }
        )
      } else {
        toast.success(`Token renewed for ${a.email}.`)
        load()   // reload to show updated status
      }
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Token renewal failed.'
      if (err.response?.data?.needs_reconnect) {
        toast.error(`${msg} — User must reconnect.`, { duration: 8000 })
      } else {
        toast.error(msg)
      }
    } finally {
      setRenewingId(null)
    }
  }

  const handleOpenInbox = (accountId) => {
    navigate(`/inbox?open_account=${accountId}`)
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <AdminLayout title="Connected Accounts">

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Link2}        label="Total accounts" value={stats?.total}   color="blue"   />
        <StatCard icon={CheckCircle2} label="Valid tokens"   value={stats?.valid}   color="green"  />
        <StatCard icon={Clock}        label="Expiring soon"  value={stats?.expiring ?? '—'} color="yellow" />
        <StatCard icon={ShieldAlert}  label="Expired tokens" value={stats?.expired} color="red"    />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-8"
            placeholder="Search email, name, user…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* User filter */}
        <select
          className="input min-w-[180px] max-w-[220px]"
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
        >
          <option value="">All users</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          className="input w-[150px]"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="valid">Valid only</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired only</option>
        </select>

        {/* Refresh + count */}
        <button
          onClick={load}
          title="Refresh"
          className="p-2 rounded-lg hover:bg-surface-raised text-gray-500 hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
        </button>
        <p className="text-sm text-gray-500 ml-auto whitespace-nowrap">
          {total} account{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Outlook Account', 'Owner', 'Cached Emails', 'Token', 'Connected', 'Actions'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center"><Spinner size={28} /></td></tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-gray-500">
                    No accounts match your filters.
                  </td>
                </tr>
              ) : accounts.map(a => (
                <tr key={a.id} className="table-row-hover group">

                  {/* Outlook account */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#0078d4]/20 flex items-center justify-center flex-shrink-0">
                        <Mail size={12} className="text-[#0078d4]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium text-xs truncate max-w-[200px]">{a.email}</p>
                        {a.display_name && (
                          <p className="text-[11px] text-gray-500 truncate max-w-[200px]">{a.display_name}</p>
                        )}
                      </div>
                      {a.is_primary && (
                        <Badge color="blue">Primary</Badge>
                      )}
                    </div>
                  </td>

                  {/* Owner */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar name={a.user_name} />
                      <div className="min-w-0">
                        <p className="text-white text-xs font-medium truncate max-w-[140px]">{a.user_name ?? '—'}</p>
                        <p className="text-[11px] text-gray-500 truncate max-w-[140px]">{a.user_email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Cached emails */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400">
                      {a.email_count > 0
                        ? <span className="text-white font-medium">{a.email_count.toLocaleString()}</span>
                        : <span className="text-gray-600">0</span>
                      }
                      <span className="text-gray-600"> emails</span>
                    </span>
                  </td>

                  {/* Token status */}
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <TokenBadge status={a.token_status} />
                    <p className="text-[10px] text-gray-600 mt-0.5">{fmtExpiry(a.token_expires_at)}</p>
                  </td>

                  {/* Connected date */}
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(a.created_at)}</td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">

                      {/* Open Inbox */}
                      <button
                        onClick={() => handleOpenInbox(a.id)}
                        title="Open inbox"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors"
                      >
                        <Inbox size={11} />
                        Inbox
                      </button>

                      {/* Extract email addresses */}
                      <button
                        onClick={() => setExtractorAccount(a)}
                        title="Extract email addresses from this mailbox"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                      >
                        <AtSign size={11} />
                        Extract
                      </button>

                      {/* Renew token — shown for expiring or expired */}
                      {(a.token_status === 'expired' || a.token_status === 'expiring') && (
                        <button
                          onClick={() => handleRenew(a)}
                          disabled={renewingId === a.id}
                          title={a.token_status === 'expired' ? 'Renew expired token' : 'Renew expiring token'}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {renewingId === a.id
                            ? <Spinner size={10} />
                            : <Zap size={11} />
                          }
                          Renew
                        </button>
                      )}

                      {/* Revoke */}
                      <button
                        onClick={() => setDeleteModal({ id: a.id, email: a.email, userName: a.user_name })}
                        title="Revoke account"
                        className="p-1.5 rounded hover:bg-surface text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} label="accounts" onPage={setPage} />
      </div>

      {/* ── Email extractor modal ──────────────────────────────────────────── */}
      <EmailExtractorModal
        account={extractorAccount}
        open={!!extractorAccount}
        onClose={() => setExtractorAccount(null)}
      />

      {/* ── Revoke confirm modal ────────────────────────────────────────────── */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Revoke Account" size="sm">
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2 rounded-lg bg-red-500/10 text-red-400 flex-shrink-0 mt-0.5">
            <AlertTriangle size={18} />
          </div>
          <div className="text-sm text-gray-300 space-y-1">
            <p>
              Revoke <span className="text-white font-medium">{deleteModal?.email}</span>
              {deleteModal?.userName && <> from <span className="text-white font-medium">{deleteModal.userName}</span></>}?
            </p>
            <p className="text-gray-500 text-xs">
              This deletes the stored tokens and all cached emails for this account.
              The user will need to reconnect to use it again.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDeleteModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} className="btn-danger">Revoke</button>
        </div>
      </Modal>

    </AdminLayout>
  )
}
