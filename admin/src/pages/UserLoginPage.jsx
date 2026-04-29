import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { API_BASE } from '../api/client'

// Fallback defaults — used if the API hasn't seeded settings yet or the
// fetch fails (e.g. first boot before the server is reachable).
const DEFAULTS = {
  login_page_title:       'Sign in',
  login_page_subtitle:    'Use your Outlook account to continue',
  login_page_button_text: 'Sign in with Microsoft',
  login_page_footer_text: 'Your Outlook email and display name will be used as your account details. No separate password required.',
  login_page_bg_color:    '#0f0f1a',
  login_page_card_color:  '#1a1a2e',
  login_page_accent_color:'#0078d4',
  login_page_logo_url:    '',
}

function MicrosoftLogo({ size = 20 }) {
  const s = size / 2
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1"        y="1"        width={s - 1} height={s - 1} fill="#f25022" />
      <rect x={s + 1}   y="1"        width={s - 1} height={s - 1} fill="#7fba00" />
      <rect x="1"        y={s + 1}   width={s - 1} height={s - 1} fill="#00a4ef" />
      <rect x={s + 1}   y={s + 1}   width={s - 1} height={s - 1} fill="#ffb900" />
    </svg>
  )
}

function DefaultOutlookIcon({ accentColor }) {
  return (
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
      style={{
        background: `${accentColor}1a`,
        border: `1px solid ${accentColor}4d`,
        boxShadow: `0 8px 24px ${accentColor}1a`,
      }}
    >
      <svg viewBox="0 0 32 32" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="4" fill={accentColor} />
        <ellipse cx="13" cy="16" rx="6" ry="7" fill="white" />
        <ellipse cx="13" cy="16" rx="4" ry="5.2" fill={accentColor} />
        <rect x="19" y="9" width="8" height="14" rx="1" fill="white" opacity="0.9" />
        <line x1="19" y1="13" x2="27" y2="13" stroke={accentColor} strokeWidth="1" />
        <line x1="19" y1="16" x2="27" y2="16" stroke={accentColor} strokeWidth="1" />
        <line x1="19" y1="19" x2="24" y2="19" stroke={accentColor} strokeWidth="1" />
      </svg>
    </div>
  )
}

export default function UserLoginPage() {
  const location  = useLocation()
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [cfg,     setCfg]     = useState(DEFAULTS)

  // Fetch admin-configured appearance (public endpoint — no auth required)
  useEffect(() => {
    fetch(`${API_BASE}/settings/login-page`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.settings) {
          setCfg(prev => ({ ...prev, ...data.settings }))
        }
      })
      .catch(() => { /* use defaults silently */ })
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const err = params.get('oauth_error')
    if (err) setError(decodeURIComponent(err))
  }, [location.search])

  function handleSignIn() {
    setLoading(true)
    setError(null)
    window.location.href = `${API_BASE}/auth/microsoft/user-login`
  }

  const accent      = cfg.login_page_accent_color || '#0078d4'
  const borderColor = `${accent}4d`   // 30 % opacity
  const accentBg    = `${accent}0d`   // 5 % opacity

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: cfg.login_page_bg_color }}
    >
      {/* Logo / icon */}
      <div className="mb-8 flex flex-col items-center gap-3">
        {cfg.login_page_logo_url ? (
          <img
            src={cfg.login_page_logo_url}
            alt="Logo"
            className="w-16 h-16 object-contain rounded-2xl"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <DefaultOutlookIcon accentColor={accent} />
        )}
        <p className="text-[13px] text-gray-500 tracking-wide uppercase">Outlook Mail</p>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-[360px] rounded-2xl shadow-2xl px-8 py-9"
        style={{
          background:   cfg.login_page_card_color,
          border:       `1px solid ${borderColor}`,
        }}
      >
        <h1 className="text-[22px] font-bold text-white text-center mb-1">
          {cfg.login_page_title}
        </h1>
        <p className="text-sm text-gray-400 text-center mb-7">
          {cfg.login_page_subtitle}
        </p>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Microsoft sign-in button */}
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center gap-3 bg-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed rounded-[4px] px-4 py-2.5 shadow transition-colors"
        >
          <MicrosoftLogo size={21} />
          <span className="flex-1 text-center text-[15px] font-semibold text-[#1a1a1a] pr-5">
            {loading ? 'Redirecting…' : cfg.login_page_button_text}
          </span>
        </button>

        {cfg.login_page_footer_text && (
          <p className="mt-5 text-center text-[11px] text-gray-600 leading-relaxed">
            {cfg.login_page_footer_text}
          </p>
        )}
      </div>
    </div>
  )
}
