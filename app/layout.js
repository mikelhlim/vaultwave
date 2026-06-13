import './globals.css'

export const metadata = {
  title: 'VaultWave — Media Collection',
  description: 'Your personal vault for vinyl, CDs, comics, and manga.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
