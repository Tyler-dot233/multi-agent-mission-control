// The local automation runtime may execute Node through Electron. Disable
// Electron's ASAR filesystem hook so electron-builder can write new archives.
process.noAsar = true
const { default: builder } = await import('electron-builder')

const { Arch, Platform, build } = builder
const platform = process.argv[2]

const dirOnly = process.argv.includes('--dir')
const zipOnly = process.argv.includes('--zip')
const prepackaged = process.argv.includes('--prepackaged')
const targets = {
  mac: () => Platform.MAC.createTarget(dirOnly ? ['dir'] : zipOnly ? ['zip'] : ['dmg', 'zip'], Arch.arm64),
  win: () => Platform.WINDOWS.createTarget(dirOnly ? ['dir'] : zipOnly ? ['zip'] : ['nsis'], Arch.x64),
}

if (!targets[platform]) {
  throw new Error('Usage: node scripts/build-desktop.mjs <mac|win> [--dir|--zip] [--prepackaged]')
}

const artifacts = await build({
  targets: targets[platform](),
  ...(prepackaged ? { prepackaged: `release/${platform === 'mac' ? 'mac-arm64' : 'win-unpacked'}` } : {}),
})
console.log(`\nGenerated artifacts:\n${artifacts.join('\n')}`)
