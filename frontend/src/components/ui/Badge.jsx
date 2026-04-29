const colors = {
  blue:   'bg-blue-500/20 text-blue-400',
  green:  'bg-green-500/20 text-green-400',
  red:    'bg-red-500/20 text-red-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  purple: 'bg-purple-500/20 text-purple-400',
  gray:   'bg-gray-500/20 text-gray-400',
}

export default function Badge({ color = 'gray', children }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
  )
}
