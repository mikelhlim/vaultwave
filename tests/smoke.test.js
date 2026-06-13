const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8')
}

test('app route exists for image detection', () => {
  const detectRoute = path.join(repoRoot, 'app/api/detect/route.js')
  assert.equal(fs.existsSync(detectRoute), true)
})

test('detection route uses a current Claude model fallback', () => {
  const source = read('app/api/detect/route.js')
  assert.match(source, /claude-sonnet-4-6/)
})

test('project has the expected Next.js entry scripts', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(typeof pkg.scripts.dev, 'string')
  assert.equal(typeof pkg.scripts.build, 'string')
  assert.equal(typeof pkg.scripts.start, 'string')
  assert.equal(typeof pkg.scripts.test, 'string')
})

const { setOverlayOpacity } = require('../lib/overlay')

test('hover overlay helper tolerates missing cards and overlays', () => {
  assert.doesNotThrow(() => setOverlayOpacity(null, '1'))
  assert.doesNotThrow(() => setOverlayOpacity({ querySelector: () => null }, '1'))
})

test('hover overlay helper updates the overlay opacity when present', () => {
  const overlay = { style: {} }
  const card = { querySelector: () => overlay }

  setOverlayOpacity(card, '0')

  assert.equal(overlay.style.opacity, '0')
})
