import axios from 'axios'

export const API_BASE = 'http://127.0.0.1:8765/api'

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

// Inject JWT from localStorage on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('mail_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401, clear token and reload to login
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mail_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
