export const MEDIA_TYPES = ['vinyl', 'cd', 'comic', 'manga']

export const TYPE_LABELS = {
  vinyl: 'Vinyl',
  cd: 'CD',
  comic: 'Comic',
  manga: 'Manga',
}

export const TYPE_COLORS = {
  vinyl: '#C8A84B',
  cd: '#5b8ed4',
  comic: '#5eaf7a',
  manga: '#e05555',
}

export const CONDITIONS = ['NM', 'VG+', 'VG', 'G', 'F']

export const CONDITION_LABELS = {
  NM: 'Near Mint',
  'VG+': 'Very Good Plus',
  VG: 'Very Good',
  G: 'Good',
  F: 'Fair',
}

export const TYPE_FIELDS = {
  vinyl: ['title', 'artist', 'album', 'year', 'genre', 'condition', 'notes'],
  cd:    ['title', 'artist', 'album', 'year', 'genre', 'condition', 'notes'],
  comic: ['title', 'author', 'publisher', 'year', 'genre', 'condition', 'notes'],
  manga: ['title', 'author', 'publisher', 'volume_number', 'year', 'genre', 'condition', 'notes'],
}

export const FIELD_LABELS = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  author: 'Author',
  publisher: 'Publisher',
  volume_number: 'Volume number',
  year: 'Year',
  genre: 'Genre',
  condition: 'Condition',
  notes: 'Notes',
}

export const TYPE_ICON = {
  vinyl: '⦿',
  cd: '◎',
  comic: '▣',
  manga: '◈',
}

export function formatItem(item) {
  const creator = item.artist || item.author || ''
  const year = item.year ? ` · ${item.year}` : ''
  const condition = item.condition ? ` · ${item.condition}` : ''
  return `${creator}${year}${condition}`
}
