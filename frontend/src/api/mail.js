import client from './client'

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login    = (email, password) => client.post('/auth/login',    { email, password }).then(r => r.data)
export const register = (name, email, password) => client.post('/auth/register', { name, email, password }).then(r => r.data)
export const getMe    = () => client.get('/auth/me').then(r => r.data)

// ── OAuth ─────────────────────────────────────────────────────────────────────
export const getMicrosoftRedirectUrl = () =>
  client.get('/auth/microsoft/redirect', {
    params: { return_url: window.location.origin },
  }).then(r => r.data)

// ── Accounts ──────────────────────────────────────────────────────────────────
export const getAccounts    = () => client.get('/accounts').then(r => r.data)
export const deleteAccount  = (id) => client.delete(`/accounts/${id}`).then(r => r.data)

// ── Folders ───────────────────────────────────────────────────────────────────
export const getFolders = (accountId, refresh = false) =>
  client.get(`/accounts/${accountId}/folders${refresh ? '?refresh=1' : ''}`).then(r => r.data)

// ── Emails ────────────────────────────────────────────────────────────────────
export const getEmails = (accountId, folderId, page = 1, perPage = 50) =>
  client.get(`/accounts/${accountId}/emails`, {
    params: { folder_id: folderId, page, per_page: perPage },
  }).then(r => r.data)

export const getEmail = (id) =>
  client.get(`/emails/${id}`).then(r => r.data)

export const markRead = (id, isRead = true) =>
  client.patch(`/emails/${id}/read`, { is_read: isRead }).then(r => r.data)

export const flagEmail = (id, flagged = true) =>
  client.patch(`/emails/${id}/flag`, { flagged }).then(r => r.data)

export const moveEmail = (id, destinationId) =>
  client.post(`/emails/${id}/move`, { destination_id: destinationId }).then(r => r.data)

export const deleteEmail = (id) =>
  client.delete(`/emails/${id}`).then(r => r.data)

export const sendEmail = (payload) =>
  client.post('/emails/send', payload).then(r => r.data)

export const replyEmail = (id, comment, replyAll = false) =>
  client.post(`/emails/${id}/reply`, { comment, reply_all: replyAll }).then(r => r.data)

export const forwardEmail = (id, comment, to) =>
  client.post(`/emails/${id}/forward`, { comment, to }).then(r => r.data)

export const getAttachments = (id) =>
  client.get(`/emails/${id}/attachments`).then(r => r.data)

// ── Search ────────────────────────────────────────────────────────────────────
export const searchEmails = (q) =>
  client.get('/search', { params: { q } }).then(r => r.data)
