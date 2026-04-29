import { create } from 'zustand'

const useMailStore = create((set, get) => ({
  // Accounts & folders
  accounts:       [],
  folders:        {},      // { [accountId]: [...folders] }
  activeFolderKey: null,   // "accountId:folderId"

  // Email list
  emails:         [],
  emailsTotal:    0,
  emailsPage:     1,
  loadingEmails:  false,

  // Open email
  openEmail:      null,
  loadingEmail:   false,

  // Compose / reply / forward state
  compose:        null,    // { mode: 'new'|'reply'|'replyAll'|'forward', email?: {...} }

  // Search
  searchQuery:    '',
  searchResults:  null,    // null = not searching, [] = results

  // Sidebar width
  sidebarOpen: true,

  setAccounts:      (accounts)          => set({ accounts }),
  setFolders:       (accountId, list)   => set(s => ({ folders: { ...s.folders, [accountId]: list } })),
  setActiveFolderKey: (key)             => set({ activeFolderKey: key, emails: [], emailsTotal: 0, emailsPage: 1, openEmail: null }),
  setEmails:        (emails, total)     => set({ emails, emailsTotal: total }),
  appendEmails:     (more, total)       => set(s => ({ emails: [...s.emails, ...more], emailsTotal: total })),
  setEmailsPage:    (page)              => set({ emailsPage: page }),
  setLoadingEmails: (v)                 => set({ loadingEmails: v }),
  setOpenEmail:     (email)             => set({ openEmail: email }),
  setLoadingEmail:  (v)                 => set({ loadingEmail: v }),
  setCompose:       (compose)           => set({ compose }),
  setSearchQuery:   (q)                 => set({ searchQuery: q }),
  setSearchResults: (r)                 => set({ searchResults: r }),
  toggleSidebar:    ()                  => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  // Mark email read locally
  markReadLocal: (id, isRead) => set(s => ({
    emails: s.emails.map(e => e.id === id ? { ...e, is_read: isRead } : e),
    openEmail: s.openEmail?.id === id ? { ...s.openEmail, is_read: isRead } : s.openEmail,
  })),

  // Remove email from list locally
  removeEmailLocal: (id) => set(s => ({
    emails: s.emails.filter(e => e.id !== id),
    openEmail: s.openEmail?.id === id ? null : s.openEmail,
  })),

  // Toggle flag locally
  toggleFlagLocal: (id, flagged) => set(s => ({
    emails: s.emails.map(e => e.id === id ? { ...e, flagged } : e),
    openEmail: s.openEmail?.id === id ? { ...s.openEmail, flagged } : s.openEmail,
  })),

  // Parsed active folder
  getActiveFolder: () => {
    const key = get().activeFolderKey
    if (!key) return null
    const [accountId, folderId] = key.split(':')
    return { accountId: parseInt(accountId), folderId }
  },
}))

export default useMailStore
