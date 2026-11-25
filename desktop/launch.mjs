// Cross-platform development launcher: some agent terminals force ELECTRON_RUN_AS_NODE=1.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const args = process.argv.slice(2)
const child = spawn(electronPath, args.length > 0 ? args : ['.'], {
  stdio: 'inherit',
  windowsHide: false,
  env,
})

child.on('close', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 0)
})
