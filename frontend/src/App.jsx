import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import useAuthStore from './store/useAuthStore'
import LoginPage    from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import InboxPage    from './pages/InboxPage'

function RequireAuth({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" replace />
}

function RequireGuest({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#2a2a3d',
            color: '#f3f4f6',
            border: '1px solid #3a3a52',
            fontSize: '13px',
          },
        }}
      />
      <Routes>
        <Route path="/login"    element={<RequireGuest><LoginPage /></RequireGuest>} />
        <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />
        <Route path="/*"        element={<RequireAuth><InboxPage /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  )
}
