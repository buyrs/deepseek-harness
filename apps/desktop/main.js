const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

app.setName('DeepSeek Harness')

// Inside a packaged build the stage closure and the Node runtime land in
// Resources/app and Resources/node (extraResources); DSH_RESOURCES lets the
// unpackaged dist run directly for verification.
const resources = process.env.DSH_RESOURCES || process.resourcesPath
const nodeBin = path.join(resources, 'node', 'bin', 'node')
const hostEntry = path.join(resources, 'app', 'lib', 'bin.js')

let child = null
let win = null
let quitting = false
let lastUrl = null

function openWindow(url) {
  if (win) return
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'DeepSeek Harness',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  win.loadURL(url)
  win.on('closed', () => { win = null })
}

function startHost() {
  child = spawn(
    nodeBin,
    [hostEntry, '--profile', 'web', '--no-open', '--port', '0'],
    {
      env: { ...process.env, DSH_HOME: app.getPath('userData') },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    process.stdout.write(chunk)
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      const match = line.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) {
        lastUrl = match[1]
        openWindow(lastUrl)
      }
    }
  })
  child.stderr.pipe(process.stderr)
  child.on('error', (error) => {
    dialog.showErrorBox('DeepSeek Harness', `Failed to start the dsh host: ${error.message}`)
    app.exit(1)
  })
  child.on('exit', (code, signal) => {
    if (quitting) return
    dialog.showErrorBox(
      'DeepSeek Harness',
      `The dsh host process exited unexpectedly (code: ${code ?? signal}).`,
    )
    app.exit(1)
  })
}

function stopHost() {
  if (!child) return
  child.kill('SIGTERM')
  setTimeout(() => { if (child && !child.killed) child.kill('SIGKILL') }, 3000).unref()
  child = null
}

app.whenReady().then(() => {
  startHost()
  app.on('activate', () => { if (win === null && child) openWindowFromLast() })
})

function openWindowFromLast() { if (lastUrl) openWindow(lastUrl) }

app.on('before-quit', () => {
  quitting = true
  stopHost()
})

app.on('window-all-closed', () => {
  quitting = true
  stopHost()
  app.quit()
})
