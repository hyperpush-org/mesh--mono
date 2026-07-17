import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const mesherRoot = resolve(import.meta.dirname, '..')
const targets = {
  client: {
    root: resolve(mesherRoot, 'client/dist/client/assets'),
    maxJsGzipBytes: 120 * 1024,
    maxTotalJsGzipBytes: 550 * 1024,
    maxTotalCssGzipBytes: 40 * 1024,
  },
  landing: {
    root: resolve(mesherRoot, 'landing/.next/static/chunks'),
    maxJsGzipBytes: 135 * 1024,
    maxTotalJsGzipBytes: 700 * 1024,
    maxTotalCssGzipBytes: 60 * 1024,
  },
}

function collectFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const candidate = resolve(root, entry.name)
    return entry.isDirectory() ? collectFiles(candidate) : [candidate]
  })
}

function kibibytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

const targetName = process.argv[2]
const target = targets[targetName]
if (!target) {
  console.error(`usage: node mesher/scripts/check-frontend-budgets.mjs <${Object.keys(targets).join('|')}>`)
  process.exit(2)
}
if (!existsSync(target.root)) {
  console.error(`budget input is missing; build ${targetName} first: ${target.root}`)
  process.exit(1)
}

const assets = collectFiles(target.root)
  .filter((file) => /\.(?:css|js)$/.test(file))
  .map((file) => {
    const contents = readFileSync(file)
    return {
      file,
      rawBytes: statSync(file).size,
      gzipBytes: gzipSync(contents, { level: 9 }).length,
      type: file.endsWith('.css') ? 'css' : 'js',
    }
  })

const jsAssets = assets.filter((asset) => asset.type === 'js')
const cssAssets = assets.filter((asset) => asset.type === 'css')
const largestJs = jsAssets.reduce((largest, asset) =>
  !largest || asset.gzipBytes > largest.gzipBytes ? asset : largest, null)
const totalJsGzipBytes = jsAssets.reduce((total, asset) => total + asset.gzipBytes, 0)
const totalCssGzipBytes = cssAssets.reduce((total, asset) => total + asset.gzipBytes, 0)

const failures = []
if (largestJs && largestJs.gzipBytes > target.maxJsGzipBytes) {
  failures.push(`largest JS chunk ${kibibytes(largestJs.gzipBytes)} exceeds ${kibibytes(target.maxJsGzipBytes)} (${largestJs.file})`)
}
if (totalJsGzipBytes > target.maxTotalJsGzipBytes) {
  failures.push(`total JS ${kibibytes(totalJsGzipBytes)} exceeds ${kibibytes(target.maxTotalJsGzipBytes)}`)
}
if (totalCssGzipBytes > target.maxTotalCssGzipBytes) {
  failures.push(`total CSS ${kibibytes(totalCssGzipBytes)} exceeds ${kibibytes(target.maxTotalCssGzipBytes)}`)
}

console.log(JSON.stringify({
  target: targetName,
  assetCount: assets.length,
  largestJsGzipBytes: largestJs?.gzipBytes ?? 0,
  totalJsGzipBytes,
  totalCssGzipBytes,
  budgets: {
    maxJsGzipBytes: target.maxJsGzipBytes,
    maxTotalJsGzipBytes: target.maxTotalJsGzipBytes,
    maxTotalCssGzipBytes: target.maxTotalCssGzipBytes,
  },
}, null, 2))

if (failures.length > 0) {
  for (const failure of failures) console.error(`budget failure: ${failure}`)
  process.exit(1)
}
