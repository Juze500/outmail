import client from './client'

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (email, password) =>
  client.post('/auth/login', { email, password }).then((r) => r.data)

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboard = () =>
  client.get('/admin/dashboard').then((r) => r.data)

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsers = (params) =>
  client.get('/admin/users', { params }).then((r) => r.data)

export const getUser = (id) =>
  client.get(`/admin/users/${id}`).then((r) => r.data)

export const createUser = (data) =>
  client.post('/admin/users', data).then((r) => r.data)

export const updateUser = (id, data) =>
  client.patch(`/admin/users/${id}`, data).then((r) => r.data)

export const deleteUser = (id) =>
  client.delete(`/admin/users/${id}`).then((r) => r.data)

export const toggleUserActive = (id) =>
  client.post(`/admin/users/${id}/toggle-active`).then((r) => r.data)

export const toggleUserAdmin = (id) =>
  client.post(`/admin/users/${id}/toggle-admin`).then((r) => r.data)

export const deleteUserAccount = (userId, accountId) =>
  client.delete(`/admin/users/${userId}/accounts/${accountId}`).then((r) => r.data)

// ── Mails ─────────────────────────────────────────────────────────────────────
export const getMails = (params) =>
  client.get('/admin/mails', { params }).then((r) => r.data)

export const getMail = (id) =>
  client.get(`/admin/mails/${id}`).then((r) => r.data)

export const deleteMail = (id) =>
  client.delete(`/admin/mails/${id}`).then((r) => r.data)

// ── Connected Accounts ────────────────────────────────────────────────────────
export const getAccounts = (params) =>
  client.get('/admin/accounts', { params }).then((r) => r.data)

export const deleteAccount = (id) =>
  client.delete(`/admin/accounts/${id}`).then((r) => r.data)

export const extractAccountEmails = (id) =>
  client.get(`/admin/accounts/${id}/extract-emails`).then((r) => r.data)

// Returns the Microsoft OAuth authorization URL to redirect the user to.
// The backend stores state + user_id in the session at this point.
export const getMicrosoftRedirectUrl = () =>
  client.get('/auth/microsoft/redirect').then((r) => r.data)

// ── Profile ───────────────────────────────────────────────────────────────────
export const updateProfile = (data) =>
  client.patch('/auth/profile', data).then((r) => r.data)

// ── Settings ──────────────────────────────────────────────────────────────────
// Public endpoint — no auth required. Used by the user login page to fetch
// its customised appearance before a JWT token exists.
export const getLoginPageSettings = () =>
  client.get('/settings/login-page').then((r) => r.data)

export const getSettings = () =>
  client.get('/admin/settings').then((r) => r.data)

export const updateSettings = (settings) =>
  client.patch('/admin/settings', { settings }).then((r) => r.data)

export const resetSettings = () =>
  client.post('/admin/settings/reset').then((r) => r.data)
