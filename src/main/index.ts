import { app, BrowserWindow, ipcMain } from 'electron'
import { DshProcess } from './dsh-process'
import { attachCloseGuard } from './close-guard'
import { installFinderOpenWorkflow, registerFiProtocol, registerOpenFolderBridge } from './finder-open'
import { registerCronBridge } from './cron'
import { installMenu } from './menu'
import { registerPluginCenterBridge } from './plugin-center'
import { registerFsBridge } from './fs-bridge'
import { createMainWindow, setDshOrigin } from './window'

const dsh = new DshProcess()
let win: BrowserWindow | null = null
let lastUrl: string | null = null
let dshDisposed = false

/** Offline page shown while dsh restarts or after a failed start. */
function statusPage(title: string, detail: string, retryable: boolean): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const button = retryable
    ? '<button onclick="window.fi ? fi.retry() : location.reload()">重试</button>'
    : ''
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,"PingFang SC",sans-serif;background:#111418;color:#9aa3ad}
  .card{text-align:center;max-width:460px;padding:0 24px}
  h1{font-size:17px;color:#d7dce1;margin:0 0 8px;font-weight:600}
  p{font-size:13px;line-height:1.6;margin:0 0 20px;white-space:pre-wrap}
  button{font-size:13px;padding:6px 18px;border-radius:6px;border:1px solid #3a4149;
    background:#1b2026;color:#d7dce1;cursor:pointer}
  button:hover{background:#232a32}
  </style></head><body><div class="card"><h1>${esc(title)}</h1><p>${esc(detail)}</p>${button}</div></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

/**
 * dsh 事件只接一次：处理器引用模块级 win（当前窗口），而非闭包捕获的旧窗口。
 * 此前 wireDsh 每次接线都 removeAllListeners，会把 cron 桥等其它模块订阅的
 * url 监听一并清掉——定时任务调度器因此拿不到握手 URL，整个静默失效。
 */
function wireDshOnce(): void {
  dsh.on('url', (url: string) => {
    lastUrl = url
    setDshOrigin(url)
    const w = win
    if (w !== null && !w.isDestroyed()) void w.loadURL(url)
  })
  dsh.on('state', (state: string) => {
    const w = win
    if (w === null || w.isDestroyed()) return
    if (state === 'restarting') {
      void w.loadURL(statusPage('与 dsh 的连接断开', 'dsh 正在重启，稍候会自动恢复…', false))
    } else if (state === 'failed') {
      void w.loadURL(statusPage('dsh 启动失败', dsh.lastError ?? '未知错误', true))
    }
  })
  dsh.on('error', (err: Error) => {
    console.error('[fi]', err.message)
  })
  dsh.on('dsh-exited', (code: number | null, signal: string | null) => {
    console.warn(`[fi] dsh exited (code=${code} signal=${signal}); restarting`)
  })
}

function showWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) {
    win.focus()
    return win
  }
  win = createMainWindow()
  attachCloseGuard(win)
  openFolder.attachWindowHooks(win)
  return win
}

function reopenAfterActivate(): void {
  const w = showWindow()
  if (dsh.state === 'ready' && lastUrl) {
    void w.loadURL(lastUrl)
  } else if (dsh.state === 'failed' || dsh.state === 'stopped') {
    dsh.retry()
  }
  // while starting/restarting the url/state events drive the window
}

// fi:// 深链接收（Finder 服务 / 外部应用）：校验 + 确认后投递给 renderer。
const openFolder = registerOpenFolderBridge({
  dsh,
  getWindow: () => win,
  showWindow,
})

app.setName('fi')
// 冒烟/多开隔离：单实例锁与用户数据都跟着 userData 走（正常路径不受影响）。
// 必须在 requestSingleInstanceLock 之前设置——锁按 userData 路径区分实例。
if (process.env.FI_USER_DATA_DIR !== undefined && process.env.FI_USER_DATA_DIR !== '') {
  app.setPath('userData', process.env.FI_USER_DATA_DIR)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {

  // 隔离实例（冒烟/多开）不碰全局系统状态：不注册 fi:// 协议、不装 Finder 服务。
  const isolated = process.env.FI_USER_DATA_DIR !== undefined && process.env.FI_USER_DATA_DIR !== ''
  if (!isolated) registerFiProtocol()

  app.on('second-instance', (_event, argv: string[]) => {
    openFolder.handleInstanceArgv(argv)
    reopenAfterActivate()
  })

  app.whenReady().then(() => {
    installMenu()
    registerFsBridge()
    registerPluginCenterBridge()
    wireDshOnce()
    registerCronBridge(dsh)
    if (!isolated) {
      installFinderOpenWorkflow({
        platform: process.platform,
        homeDir: app.getPath('home'),
        logger: {
          info: (...args: unknown[]) => console.log('[fi]', ...args),
          warn: (...args: unknown[]) => console.warn('[fi]', ...args),
        },
      })
    }
    showWindow()
    dsh.start()
    openFolder.flushQueuedUrl()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) reopenAfterActivate()
  })

  app.on('window-all-closed', () => {
    // macOS convention: stay alive (dsh keeps running) for instant re-open.
    if (process.platform !== 'darwin') app.quit()
  })

  // dsh must not outlive us as an orphan. will-quit fires only when the quit
  // is certain (windows already closed, close-guard satisfied).
  app.on('will-quit', (event) => {
    if (dshDisposed) return
    event.preventDefault()
    void dsh.dispose().then(() => {
      dshDisposed = true
      app.quit()
    })
  })

  ipcMain.on('fi:retry', () => {
    dsh.retry()
  })
}
