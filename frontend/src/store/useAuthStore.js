import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user:  null,
      setAuth:  (token, user) => {
        localStorage.setItem('mail_token', token)
        set({ token, user })
      },
      logout: () => {
        localStorage.removeItem('mail_token')
        set({ token: null, user: null })
      },
    }),
    {
      name: 'mail_auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
)

export default useAuthStore
