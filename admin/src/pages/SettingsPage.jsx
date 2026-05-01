import { useEffect, useState } from 'react'
import {
  Save, RotateCcw, AlertTriangle, Eye, EyeOff,
  ExternalLink, CheckCircle, XCircle, Info, Copy,
  ChevronDown, ChevronRight, Building2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { getSettings, updateSettings, resetSettings } from '../api/admin'
import { OAUTH_REDIRECT_URI } from '../api/client'
import { getMicrosoftAdminConsentUrl } from '../api/mail'

const GROUP_LABELS = {
  general:    'General',
  accounts:   'Account Limits',
  sync:       'Email Sync',
  security:   'Security',
  login_page: 'User Login Page',
  azure:      'Azure / Microsoft OAuth',
}

const GROUP_ORDER = ['general', 'accounts', 'sync', 'security', 'login_page', 'azure']

export default function SettingsPage() {
  const [grouped,     setGrouped]     = useState({})
  const [pending,     setPending]     = useState({})
  const [loading,     setLoading]     = useState(true)
  const [savingGroup, setSavingGroup] = useState(null)
  const [savingAll,   setSavingAll]   = useState(false)
  const [resetModal,  setResetModal]  = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getSettings()
      setGrouped(data.settings)
      setPending({})
    } catch {
      toast.error('Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const change = (key, value) => setPending(p => ({ ...p, [key]: value }))

  const getValue = (key, rawValue, type) => {
    if (key in pending) return pending[key]
    if (type === 'boolean') return rawValue === '1' || rawValue === true
    if (type === 'integer') return Number(rawValue)
    return rawValue ?? ''
  }

  const pendingCountForGroup = (group) => {
    const keys = (grouped[group] ?? []).map(s => s.key)
    return keys.filter(k => k in pending).length
  }

  const totalPending = Object.keys(pending).length

  // Save only the keys belonging to a specific group, then strip them from pending.
  const saveGroup = async (group) => {
    const keys   = (grouped[group] ?? []).map(s => s.key)
    const subset = Object.fromEntries(keys.filter(k => k in pending).map(k => [k, pending[k]]))
    if (!Object.keys(subset).length) return

    setSavingGroup(group)
    try {
      await updateSettings(subset)
      toast.success(`${GROUP_LABELS[group] ?? group} saved.`)
      setPending(p => {
        const next = { ...p }
        keys.forEach(k => delete next[k])
        return next
      })
      // Reload this group from DB to get fresh raw_values
      const fresh = await getSettings()
      setGrouped(fresh.settings)
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to save.')
    } finally {
      setSavingGroup(null)
    }
  }

  const saveAll = async () => {
    if (!totalPending) return
    setSavingAll(true)
    try {
      await updateSettings(pending)
      toast.success('All settings saved.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to save.')
    } finally {
      setSavingAll(false)
    }
  }

  const handleReset = async () => {
    try {
      await resetSettings()
      toast.success('Settings reset to defaults.')
      setResetModal(false)
      load()
    } catch {
      toast.error('Reset failed.')
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Settings">
        <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>
      </AdminLayout>
    )
  }

  const sortedGroups = GROUP_ORDER.filter(g => grouped[g])
    .concat(Object.keys(grouped).filter(g => !GROUP_ORDER.includes(g)))

  return (
    <AdminLayout title="Settings">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm">
          {totalPending > 0
            ? <span className="text-yellow-400 font-medium">{totalPending} unsaved change{totalPending > 1 ? 's' : ''}</span>
            : <span className="text-gray-600">All settings saved</span>
          }
        </p>
        <div className="flex gap-2">
          <button onClick={() => setResetModal(true)} className="btn-ghost">
            <RotateCcw size={14} /> Reset defaults
          </button>
          {totalPending > 0 && (
            <button onClick={saveAll} disabled={savingAll} className="btn-primary">
              <Save size={14} /> {savingAll ? 'Saving…' : `Save all (${totalPending})`}
            </button>
          )}
        </div>
      </div>

      {/* ── Layout: sticky nav + sections ── */}
      <div className="flex gap-6 items-start">

        {/* Left sticky nav — visible on wide screens */}
        <nav className="hidden xl:block w-44 flex-shrink-0 sticky top-4">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-3 mb-2">
            Sections
          </p>
          <ul className="space-y-0.5">
            {sortedGroups.map(group => {
              const count = pendingCountForGroup(group)
              return (
                <li key={group}>
                  <a
                    href={`#section-${group}`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-surface-raised transition-colors group"
                  >
                    <span className="truncate">{GROUP_LABELS[group] ?? group}</span>
                    {count > 0 && (
                      <span className="ml-1.5 w-4 h-4 rounded-full bg-brand text-white text-[9px] flex items-center justify-center font-bold flex-shrink-0">
                        {count}
                      </span>
                    )}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ── Sections ── */}
        <div className="flex-1 min-w-0 space-y-4">
          {sortedGroups.map(group => {
            const settings    = grouped[group] ?? []
            const changeCount = pendingCountForGroup(group)
            const saving      = savingGroup === group
            const onSave      = () => saveGroup(group)

            if (group === 'azure') {
              return (
                <AzureSection
                  key="azure"
                  settings={settings}
                  pending={pending}
                  getValue={getValue}
                  onChange={change}
                  changeCount={changeCount}
                  onSave={onSave}
                  saving={saving}
                />
              )
            }
            if (group === 'login_page') {
              return (
                <LoginPageSection
                  key="login_page"
                  settings={settings}
                  pending={pending}
                  getValue={getValue}
                  onChange={change}
                  changeCount={changeCount}
                  onSave={onSave}
                  saving={saving}
                />
              )
            }
            return (
              <SectionCard
                key={group}
                id={`section-${group}`}
                title={GROUP_LABELS[group] ?? group}
                changeCount={changeCount}
                onSave={onSave}
                saving={saving}
              >
                <div className="divide-y divide-surface-border">
                  {settings.map(s => (
                    <SettingRow
                      key={s.key}
                      setting={s}
                      currentValue={getValue(s.key, s.raw_value, s.type)}
                      changed={s.key in pending}
                      onChange={val => change(s.key, val)}
                    />
                  ))}
                </div>
              </SectionCard>
            )
          })}
        </div>
      </div>

      {/* ── Reset confirm modal ── */}
      <Modal open={resetModal} onClose={() => setResetModal(false)} title="Reset Settings" size="sm">
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 flex-shrink-0">
            <AlertTriangle size={18} />
          </div>
          <p className="text-sm text-gray-300">
            This will restore all settings (except Azure credentials) to their factory defaults.
            Any customisations will be lost.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setResetModal(false)} className="btn-ghost">Cancel</button>
          <button onClick={handleReset} className="btn-danger">Reset all settings</button>
        </div>
      </Modal>
    </AdminLayout>
  )
}

// =============================================================================
// SectionCard — collapsible card with per-section save button
// =============================================================================
function SectionCard({ id, title, badge, changeCount, onSave, saving, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div id={id} className="card scroll-mt-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-surface-border">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          {open
            ? <ChevronDown  size={13} className="text-gray-500 flex-shrink-0" />
            : <ChevronRight size={13} className="text-gray-500 flex-shrink-0" />
          }
          <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
          {badge}
          {changeCount > 0 && (
            <span className="text-[11px] text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full flex-shrink-0">
              {changeCount} modified
            </span>
          )}
        </button>

        {changeCount > 0 ? (
          <button
            onClick={onSave}
            disabled={saving}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-shrink-0"
          >
            <Save size={12} /> {saving ? 'Saving…' : 'Save section'}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-600 flex-shrink-0">
            <CheckCircle size={12} /> Saved
          </span>
        )}
      </div>

      {open && <div className="mt-4">{children}</div>}
    </div>
  )
}

// =============================================================================
// Login Page section — live-preview designer
// =============================================================================
function LoginPageSection({ settings, pending, getValue, onChange, changeCount, onSave, saving }) {
  const byKey = Object.fromEntries(settings.map(s => [s.key, s]))

  const val = (key) => {
    const s = byKey[key]
    if (!s) return ''
    return getValue(s.key, s.raw_value, s.type)
  }

  const title        = val('login_page_title')           || 'Sign in'
  const subtitle     = val('login_page_subtitle')        || ''
  const badgeText    = val('login_page_badge_text')      || 'OUTLOOK MAIL'
  const btnText      = val('login_page_button_text')     || 'Sign in with Microsoft'
  const step1Label   = val('login_page_step1_label')     || 'Step 1 — Copy this code'
  const step2Label   = val('login_page_step2_label')     || 'Step 2 — Open this page'
  const waitingText  = val('login_page_waiting_text')    || 'Waiting for sign-in…'
  const footerText   = val('login_page_footer_text')     || ''
  const bgColor      = val('login_page_bg_color')        || '#0f0f1a'
  const cardColor    = val('login_page_card_color')      || '#1a1a2e'
  const accent       = val('login_page_accent_color')    || '#0078d4'
  const logoUrl      = val('login_page_logo_url')        || ''
  const autoOpenLink = val('login_page_auto_open_link')

  const textFields = [
    { key: 'login_page_title',        label: 'Page title',        placeholder: 'Sign in' },
    { key: 'login_page_subtitle',     label: 'Sub-heading',       placeholder: 'Use your Outlook account to continue' },
    { key: 'login_page_badge_text',   label: 'Badge text',        placeholder: 'OUTLOOK MAIL' },
    { key: 'login_page_step1_label',  label: 'Step 1 label',      placeholder: 'Step 1 — Copy this code' },
    { key: 'login_page_step2_label',  label: 'Step 2 label',      placeholder: 'Step 2 — Open this page' },
    { key: 'login_page_button_text',  label: 'Button label',      placeholder: 'Sign in with Microsoft' },
    { key: 'login_page_waiting_text', label: 'Waiting status',    placeholder: 'Waiting for sign-in…' },
    { key: 'login_page_footer_text',  label: 'Footer note',       placeholder: 'Small print at the bottom of the card…' },
    { key: 'login_page_logo_url',     label: 'Custom logo URL',   placeholder: 'https://…/logo.png  (leave blank for default)' },
  ]

  const colorFields = [
    { key: 'login_page_bg_color',    label: 'Page background' },
    { key: 'login_page_card_color',  label: 'Card background' },
    { key: 'login_page_accent_color',label: 'Accent colour'   },
  ]

  return (
    <SectionCard
      id="section-login_page"
      title="User Login Page"
      changeCount={changeCount}
      onSave={onSave}
      saving={saving}
    >
      <p className="text-xs text-gray-500 mb-5">
        Customise how the sign-in page looks for regular users. Changes take effect immediately after saving.
      </p>

      <div className="flex gap-6 flex-wrap lg:flex-nowrap">
        {/* Fields */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Text fields */}
          <div className="divide-y divide-surface-border">
            {textFields.map(({ key, label, placeholder }) => {
              const s = byKey[key]
              if (!s) return null
              const current = getValue(s.key, s.raw_value, s.type)
              const changed = s.key in pending
              return (
                <div key={key} className={`flex items-start gap-3 py-3 px-2 rounded-lg transition-colors ${changed ? 'bg-brand/5' : ''}`}>
                  <div className="w-36 flex-shrink-0 pt-2">
                    <p className="text-xs font-medium text-gray-300">{label}</p>
                    {changed && <span className="text-[10px] text-brand">modified</span>}
                  </div>
                  <input
                    type="text"
                    className="input flex-1 text-sm"
                    value={current}
                    onChange={e => onChange(key, e.target.value)}
                    placeholder={placeholder}
                  />
                </div>
              )
            })}
          </div>

          {/* Behaviour toggles */}
          <div className="pt-3 pb-1">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">Behaviour</p>
            {byKey['login_page_auto_open_link'] && (() => {
              const s       = byKey['login_page_auto_open_link']
              const current = getValue(s.key, s.raw_value, s.type)
              const changed = s.key in pending
              return (
                <div key={s.key} className={`flex items-center gap-3 py-2.5 px-2 rounded-lg transition-colors ${changed ? 'bg-brand/5' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-300">Auto-open Microsoft page on copy</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                      When the user clicks Copy, automatically open the Microsoft sign-in tab so they can paste the code immediately.
                    </p>
                    {changed && <span className="text-[10px] text-brand">modified</span>}
                  </div>
                  <button
                    onClick={() => onChange(s.key, !current)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${current ? 'bg-brand' : 'bg-surface-border'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${current ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              )
            })()}
          </div>

          {/* Colour pickers */}
          <div className="pt-3 space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-2">Colours</p>
            {colorFields.map(({ key, label }) => {
              const s = byKey[key]
              if (!s) return null
              const current = getValue(s.key, s.raw_value, s.type)
              const changed = s.key in pending
              return (
                <div key={key} className={`flex items-center gap-3 py-2 px-2 rounded-lg transition-colors ${changed ? 'bg-brand/5' : ''}`}>
                  <div className="w-36 flex-shrink-0">
                    <p className="text-xs font-medium text-gray-300">{label}</p>
                    {changed && <span className="text-[10px] text-brand">modified</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="w-9 h-9 rounded-lg cursor-pointer border border-surface-border bg-transparent p-0.5 flex-shrink-0"
                      value={current || '#000000'}
                      onChange={e => onChange(key, e.target.value)}
                    />
                    <input
                      type="text"
                      className="input w-28 font-mono text-xs"
                      value={current}
                      onChange={e => onChange(key, e.target.value)}
                      placeholder="#000000"
                      maxLength={7}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Live preview */}
        <div className="flex-shrink-0 w-60">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Preview</p>
          <div
            className="rounded-2xl p-5 flex flex-col items-center shadow-xl"
            style={{ background: bgColor, border: `1px solid ${accent}22` }}
          >
            {/* Logo */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
              style={{ background: `${accent}1a`, border: `1px solid ${accent}4d` }}
            >
              {logoUrl
                ? <img src={logoUrl} alt="" className="w-7 h-7 object-contain rounded" />
                : (
                  <svg viewBox="0 0 32 32" width="22" height="22">
                    <rect width="32" height="32" rx="4" fill={accent} />
                    <ellipse cx="13" cy="16" rx="6" ry="7" fill="white" />
                    <ellipse cx="13" cy="16" rx="4" ry="5.2" fill={accent} />
                    <rect x="19" y="9" width="8" height="14" rx="1" fill="white" opacity="0.9" />
                    <line x1="19" y1="13" x2="27" y2="13" stroke={accent} strokeWidth="1" />
                    <line x1="19" y1="16" x2="27" y2="16" stroke={accent} strokeWidth="1" />
                    <line x1="19" y1="19" x2="24" y2="19" stroke={accent} strokeWidth="1" />
                  </svg>
                )
              }
            </div>

            {/* Badge */}
            <p className="text-[8px] text-gray-500 tracking-widest uppercase mb-2">{badgeText}</p>

            {/* Card */}
            <div
              className="w-full rounded-xl px-3 pt-3 pb-2.5"
              style={{ background: cardColor, border: `1px solid ${accent}30` }}
            >
              <p className="text-[11px] font-bold text-white mb-0.5 text-center truncate">{title}</p>
              {subtitle && <p className="text-[8px] text-gray-400 mb-2 text-center leading-tight line-clamp-2">{subtitle}</p>}

              {/* Step 1 — code */}
              <p className="text-[7px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{step1Label}</p>
              <div className="rounded-lg py-2 mb-2 text-center" style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
                <span className="text-[10px] font-mono font-bold tracking-[0.2em]" style={{ color: accent }}>CQX6V9X7G</span>
              </div>

              {/* Step 2 — button */}
              <p className="text-[7px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{step2Label}</p>
              <div className="rounded-lg px-2 py-1.5 flex items-center gap-1.5 justify-center mb-2" style={{ background: accent }}>
                <div className="grid grid-cols-2 gap-0.5 flex-shrink-0">
                  {['#f25022','#7fba00','#00a4ef','#ffb900'].map(c => (
                    <div key={c} className="w-1 h-1 rounded-[1px]" style={{ background: c }} />
                  ))}
                </div>
                <span className="text-[7px] font-semibold text-white truncate leading-none">{btnText}</span>
              </div>

              {/* Waiting */}
              <p className="text-[7px] text-gray-500 text-center">{waitingText}</p>

              {footerText && (
                <p className="text-[7px] text-gray-600 leading-tight line-clamp-2 mt-2 text-center border-t border-white/5 pt-2">{footerText}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

// =============================================================================
// Azure section — setup guide + credential fields
// =============================================================================
function AzureSection({ settings, pending, getValue, onChange, changeCount, onSave, saving }) {
  const byKey = Object.fromEntries(settings.map(s => [s.key, s]))

  const clientId     = byKey['azure_client_id']
  const clientSecret = byKey['azure_client_secret']
  const tenantId     = byKey['azure_tenant_id']
  const redirectUri  = byKey['azure_redirect_uri']

  const isConfigured = clientId?.raw_value && clientSecret?.is_set && redirectUri?.raw_value

  const redirectCurrentValue = getValue(
    redirectUri?.key,
    redirectUri?.raw_value || OAUTH_REDIRECT_URI,
    redirectUri?.type
  )

  useEffect(() => {
    if (redirectUri && !redirectUri.raw_value && !(redirectUri.key in pending)) {
      onChange(redirectUri.key, OAUTH_REDIRECT_URI)
    }
  }, [redirectUri?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyRedirectUri = () => {
    navigator.clipboard.writeText(OAUTH_REDIRECT_URI)
      .then(() => toast.success('Copied!'))
      .catch(() => toast.error('Copy failed.'))
  }

  const statusBadge = isConfigured
    ? <span className="flex items-center gap-1 text-xs text-emerald-400 flex-shrink-0"><CheckCircle size={12} /> Configured</span>
    : <span className="flex items-center gap-1 text-xs text-yellow-400 flex-shrink-0"><XCircle    size={12} /> Not configured</span>

  return (
    <SectionCard
      id="section-azure"
      title="Azure / Microsoft OAuth"
      badge={statusBadge}
      changeCount={changeCount}
      onSave={onSave}
      saving={saving}
    >
      {/* Setup guide */}
      <div className="rounded-lg bg-brand/5 border border-brand/20 p-4 mb-6">
        <p className="text-xs font-semibold text-brand mb-3 flex items-center gap-1.5">
          <Info size={13} /> How to get your Azure credentials
        </p>
        <ol className="space-y-2.5 text-xs text-gray-300 list-none">
          <Step n={1}>
            Go to{' '}
            <a
              href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank" rel="noopener noreferrer"
              className="text-brand underline inline-flex items-center gap-0.5"
            >
              portal.azure.com → App registrations <ExternalLink size={11} />
            </a>
            {' '}and click <strong className="text-white">New registration</strong>.
          </Step>
          <Step n={2}>
            Enter a name (e.g. <em>Mail Manager</em>), choose <strong className="text-white">Accounts in any organizational directory and personal Microsoft accounts</strong>, then click <strong className="text-white">Register</strong>.
          </Step>
          <Step n={3}>
            Copy the <strong className="text-white">Application (client) ID</strong> from Overview → paste into <strong className="text-white">Client ID</strong> below.
          </Step>
          <Step n={4}>
            Copy the <strong className="text-white">Directory (tenant) ID</strong> → paste into <strong className="text-white">Tenant ID</strong> (or leave <code className="bg-surface-raised px-1 rounded">common</code> for both personal + work).
          </Step>
          <Step n={5}>
            Go to <strong className="text-white">Certificates &amp; secrets → New client secret</strong>. Copy the <strong className="text-white">Value</strong> column immediately — it won't be shown again.
          </Step>
          <Step n={6}>
            Go to <strong className="text-white">Authentication → Add a platform → Web</strong>. Set the Redirect URI to the value shown below. Enable <strong className="text-white">ID tokens</strong> and save.
          </Step>
          <Step n={7}>
            <strong className="text-white">API permissions → Add → Microsoft Graph → Delegated</strong>:{' '}
            <code className="bg-surface-raised px-1 rounded text-gray-200">Mail.ReadWrite</code>{' '}
            <code className="bg-surface-raised px-1 rounded text-gray-200">Mail.Send</code>{' '}
            <code className="bg-surface-raised px-1 rounded text-gray-200">User.Read</code>{' '}
            <code className="bg-surface-raised px-1 rounded text-gray-200">offline_access</code>.
            Then click <strong className="text-white">Grant admin consent</strong>.
          </Step>
          <Step n={8}>
            <strong className="text-white">Authentication → Advanced settings → Allow public client flows</strong> → set to{' '}
            <strong className="text-white">Yes</strong> and save.{' '}
            <span className="text-gray-500">Required for the device-code sign-in flow on the user login page.</span>
          </Step>
        </ol>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        {clientId && (
          <AzureField
            setting={clientId}
            currentValue={getValue(clientId.key, clientId.raw_value, clientId.type)}
            changed={clientId.key in pending}
            onChange={v => onChange(clientId.key, v)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            label="Client ID"
          />
        )}
        {tenantId && (
          <AzureField
            setting={tenantId}
            currentValue={getValue(tenantId.key, tenantId.raw_value, tenantId.type)}
            changed={tenantId.key in pending}
            onChange={v => onChange(tenantId.key, v)}
            placeholder="common  (or your tenant GUID)"
            label="Tenant ID"
          />
        )}
        {redirectUri && (
          <AzureField
            setting={redirectUri}
            currentValue={redirectCurrentValue}
            changed={redirectUri.key in pending}
            onChange={v => onChange(redirectUri.key, v)}
            placeholder={OAUTH_REDIRECT_URI}
            label="Redirect URI"
            suffix={
              <button
                type="button"
                onClick={copyRedirectUri}
                title="Copy redirect URI"
                className="p-1.5 rounded hover:bg-surface-raised text-gray-500 hover:text-gray-300 transition-colors"
              >
                <Copy size={13} />
              </button>
            }
          />
        )}
        {clientSecret && (
          <AzureSecretField
            setting={clientSecret}
            currentValue={getValue(clientSecret.key, clientSecret.raw_value, clientSecret.type)}
            changed={clientSecret.key in pending}
            isSet={clientSecret.is_set}
            onChange={v => onChange(clientSecret.key, v)}
          />
        )}
      </div>

      {/* Admin Consent URL — for org admins who block user consent */}
      {isConfigured && <AdminConsentUrlPanel />}
    </SectionCard>
  )
}

/**
 * Lets the admin generate and copy/share the Microsoft admin-consent URL.
 * Useful when a user's organization blocks user consent for third-party apps.
 */
function AdminConsentUrlPanel() {
  const [url,     setUrl]     = useState('')
  const [loading, setLoading] = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [error,   setError]   = useState('')
  const [open,    setOpen]    = useState(false)

  function fetchUrl() {
    if (url) { setOpen(true); return }
    setLoading(true)
    setError('')
    getMicrosoftAdminConsentUrl()
      .then(d => { setUrl(d.url ?? ''); setOpen(true) })
      .catch(e => setError(e.response?.data?.message ?? 'Failed to generate URL.'))
      .finally(() => setLoading(false))
  }

  function handleCopy() {
    if (!url) return
    navigator.clipboard.writeText(url)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
      .catch(() => toast.error('Copy failed.'))
  }

  return (
    <div className=""></div>
  )
}

function Step({ n, children }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand/20 text-brand flex items-center justify-center font-bold text-[10px]">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

function AzureField({ setting, currentValue, changed, onChange, placeholder, label, suffix }) {
  return (
    <div className={`flex items-start gap-4 p-3 rounded-lg transition-colors ${changed ? 'bg-brand/5 ring-1 ring-brand/20' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{label}</p>
          {changed && <span className="text-xs text-brand">modified</span>}
        </div>
        {setting.description && <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>}
      </div>
      <div className="flex-shrink-0 w-72 flex items-center gap-1">
        <input
          type="text"
          className="input font-mono text-xs flex-1"
          value={currentValue}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        {suffix}
      </div>
    </div>
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function AzureSecretField({ setting, currentValue, changed, isSet, onChange }) {
  const [show,    setShow]    = useState(false)
  const [editing, setEditing] = useState(false)

  const displayValue      = editing || changed ? (changed ? currentValue : '') : (isSet ? '••••••••' : '')
  const looksLikeSecretId = changed && UUID_RE.test((currentValue ?? '').trim())

  const handleFocus = () => {
    if (!editing) { setEditing(true); onChange('') }
  }

  return (
    <div className={`p-3 rounded-lg transition-colors ${changed ? 'bg-brand/5 ring-1 ring-brand/20' : ''} ${looksLikeSecretId ? '!bg-red-500/5 !ring-red-500/30' : ''}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white">Client Secret</p>
            {isSet && !changed && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={11} /> set</span>}
            {changed && !looksLikeSecretId && <span className="text-xs text-brand">modified</span>}
            {looksLikeSecretId && <span className="flex items-center gap-1 text-xs text-red-400 font-semibold"><XCircle size={11} /> wrong field — see warning</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>
          {isSet && !changed && <p className="text-xs text-yellow-500/80 mt-1">Click the field to replace the current secret.</p>}
        </div>
        <div className="flex-shrink-0 w-72 relative">
          <input
            type={show ? 'text' : 'password'}
            className={`input font-mono text-xs pr-10 ${looksLikeSecretId ? 'border-red-500/50' : ''}`}
            value={displayValue}
            placeholder={isSet ? 'Enter new secret to replace…' : 'Paste secret value here…'}
            autoComplete="new-password"
            spellCheck={false}
            onFocus={handleFocus}
            onChange={e => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            tabIndex={-1}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {looksLikeSecretId && (
        <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-2">
          <p className="font-semibold text-red-400 flex items-center gap-1.5"><XCircle size={13} /> You pasted the Secret ID, not the Secret Value</p>
          <p>Azure shows two columns — copy from the <strong className="text-white">Value</strong> column:</p>
          <div className="font-mono bg-black/30 rounded p-2.5 space-y-2 text-[11px]">
            <div>
              <span className="text-red-400 font-semibold">Secret ID</span>
              <span className="text-gray-500 ml-2">(do NOT use)</span>
              <br /><span className="text-gray-400">97ab8402-b6a1-4685-8397-226c7144d639</span>
            </div>
            <div>
              <span className="text-emerald-400 font-semibold">Value</span>
              <span className="text-gray-500 ml-2">(copy THIS — only visible once)</span>
              <br /><span className="text-gray-400">Ktz8Q~aBcDeFgHiJkLmNoPqRsTuVwXyz_example</span>
            </div>
          </div>
          <p className="text-yellow-400/90">
            If you didn't save the Value: go to <strong className="text-white">Azure → Certificates &amp; secrets</strong>, delete the secret, create a new one, and copy the <strong className="text-white">Value</strong> immediately.
          </p>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Generic setting row (used in non-custom groups)
// =============================================================================
function SettingRow({ setting, currentValue, changed, onChange }) {
  const { key, type, description } = setting

  return (
    <div className={`flex items-start gap-4 py-4 px-2 transition-colors ${changed ? 'bg-brand/5 rounded-lg' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white font-mono">{key}</p>
          {changed && <span className="text-xs text-brand">modified</span>}
        </div>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0 w-56">
        {type === 'boolean' ? (
          <button
            onClick={() => onChange(!currentValue)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${currentValue ? 'bg-brand' : 'bg-surface-border'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${currentValue ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        ) : type === 'integer' ? (
          <input
            type="number"
            className="input text-right"
            value={currentValue}
            onChange={e => onChange(e.target.value)}
            min={0}
          />
        ) : (
          <input
            type="text"
            className="input"
            value={currentValue}
            onChange={e => onChange(e.target.value)}
            placeholder="—"
          />
        )}
      </div>
    </div>
  )
}
