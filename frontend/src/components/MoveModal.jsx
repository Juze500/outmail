import { useState } from 'react'
import { Folder } from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../store/useMailStore'
import { moveEmail } from '../api/mail'
import Modal from './ui/Modal'
import Spinner from './ui/Spinner'

export default function MoveModal({ open, onClose }) {
  const { openEmail, folders, accounts, removeEmailLocal } = useMailStore()
  const [moving, setMoving] = useState(false)

  if (!openEmail) return null

  // Find which account owns this email
  const accountId = openEmail.account_id
  const accountFolders = folders[accountId] ?? []

  async function handleMove(folderId) {
    setMoving(true)
    try {
      await moveEmail(openEmail.id, folderId)
      removeEmailLocal(openEmail.id)
      toast.success('Email moved.')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to move email.')
    } finally {
      setMoving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Move to Folder" size="sm">
      {moving ? (
        <div className="flex justify-center py-8"><Spinner size={24} /></div>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {accountFolders.map(folder => (
            <button
              key={folder.id}
              onClick={() => handleMove(folder.graph_folder_id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#3a3a52] text-left transition-colors"
            >
              <Folder size={14} className="text-gray-500 flex-shrink-0" />
              <span className="text-sm text-gray-300">{folder.display_name}</span>
              {folder.unread_items > 0 && (
                <span className="ml-auto text-[10px] text-gray-600">{folder.unread_items} unread</span>
              )}
            </button>
          ))}
          {accountFolders.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-6">No folders available.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
