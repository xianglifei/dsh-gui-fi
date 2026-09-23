import { contextBridge, ipcRenderer } from 'electron'

// --- Finder 服务 / fi:// 深链投递（见 src/main/finder-open.ts）---
// 主进程在「确认时」与「窗口每次加载完成」两个时机发送；事件可能早于
// fi-sidebar 客户端 boot 到达，这里先排队，客户端订阅 onOpen 时冲队列。
// 回调执行完回执 done，主进程收到才清 pending（重复投递无害：建区幂等 +
// blank 会话复用）。
let openListener: ((path: string) => void) | null = null
const openQueue: { path: string }[] = []

function notifyOpenWorkspace(path: string): void {
  try {
    openListener?.(path)
  } finally {
    ipcRenderer.send('fi:open-workspace:done', { path })
  }
}

ipcRenderer.on('fi:open-workspace', (_event, payload: { path?: unknown }) => {
  if (payload !== null && typeof payload === 'object' && typeof payload.path === 'string') {
    if (openListener !== null) notifyOpenWorkspace(payload.path)
    else openQueue.push({ path: payload.path })
  }
})

contextBridge.exposeInMainWorld('fi', {
  retry: () => ipcRenderer.send('fi:retry'),

  // --- 项目模式文件桥（见 src/main/fs-bridge.ts）---
  // 全部返回结构化结果 Promise；只读文件系统 + 系统语义动作。
  fs: {
    home: () => ipcRenderer.invoke('fi:fs:home'),
    readdir: (path: string) => ipcRenderer.invoke('fi:fs:readdir', path),
  },
  shell: {
    open: (path: string) => ipcRenderer.invoke('fi:shell:open', path),
    showInFolder: (path: string) => ipcRenderer.invoke('fi:shell:show-in-folder', path),
  },
  clipboard: {
    write: (text: string) => ipcRenderer.invoke('fi:clipboard:write', text),
  },

  // --- 定时任务桥（见 src/main/cron.ts）---
  // list/changed 推全量任务数组（≤20 条，无分页）；写操作返回 {ok, error?}。
  cron: {
    list: () => ipcRenderer.invoke('fi:cron:list'),
    create: (draft: unknown) => ipcRenderer.invoke('fi:cron:create', draft),
    update: (id: string, draft: unknown) => ipcRenderer.invoke('fi:cron:update', { id, draft }),
    remove: (id: string) => ipcRenderer.invoke('fi:cron:delete', id),
    setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('fi:cron:setEnabled', { id, enabled }),
    runNow: (id: string) => ipcRenderer.invoke('fi:cron:runNow', id),
    pickFolder: () => ipcRenderer.invoke('fi:cron:pickFolder'),
    defaultDir: () => ipcRenderer.invoke('fi:cron:defaultDir'),
    onChanged: (callback: (tasks: unknown[]) => void) => {
      const handler = (_event: unknown, tasks: unknown[]) => callback(tasks)
      ipcRenderer.on('fi:cron:changed', handler)
      return () => ipcRenderer.removeListener('fi:cron:changed', handler)
    },
  },

  // --- 插件中心桥（见 src/main/plugin-center.ts）---
  // list 返回 fi profile 的已安装插件全量；install/remove 返回 {ok, error?}；
  // changed 在安装/卸载成功后推全量。
  plugins: {
    list: () => ipcRenderer.invoke('fi:plugins:list'),
    install: (spec: string) => ipcRenderer.invoke('fi:plugins:install', spec),
    remove: (name: string) => ipcRenderer.invoke('fi:plugins:remove', name),
    onChanged: (callback: (plugins: unknown[]) => void) => {
      const handler = (_event: unknown, plugins: unknown[]) => callback(plugins)
      ipcRenderer.on('fi:plugins:changed', handler)
      return () => ipcRenderer.removeListener('fi:plugins:changed', handler)
    },
  },

  // --- Finder 服务 / fi:// 深链投递（见 src/main/finder-open.ts）---
  // 单订阅方（fi-sidebar 客户端模块），无需取消接口。
  openWorkspace: {
    onOpen: (callback: (path: string) => void) => {
      openListener = callback
      while (openQueue.length > 0) {
        const payload = openQueue.shift()
        if (payload !== undefined) notifyOpenWorkspace(payload.path)
      }
    },
  },
})

// --- busy watcher (drives the close confirmation in the main process) ---
// While streaming, dsh's composer swaps its send button for a stop button
// labelled aria-label t("input.stop") → "停止生成" (zh) / "Stop generating"
// (en). If that marker stops matching (dsh update, other UI language), busy
// stays false and closing is simply never blocked — degrade, don't nag.

const BUSY_LABEL_RE = /^(停止生成|stop generating)$/i
const SCAN_INTERVAL_MS = 2000
const IDLE_LAG_MS = 1500

let busy = false
let idleTimer: number | undefined
let scanScheduled = false

function isBusyNow(): boolean {
  const labelled = document.querySelectorAll<HTMLElement>('[aria-label], [title]')
  for (const el of labelled) {
    const label = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '').trim()
    if (BUSY_LABEL_RE.test(label)) return true
  }
  return false
}

function report(next: boolean): void {
  if (next) {
    window.clearTimeout(idleTimer)
    idleTimer = undefined
    if (!busy) {
      busy = true
      ipcRenderer.send('fi:busy', true)
    }
    return
  }
  if (!busy || idleTimer !== undefined) return
  // Lag the idle transition so a mid-run flicker of the button doesn't open
  // a close-confirmation window.
  idleTimer = window.setTimeout(() => {
    idleTimer = undefined
    busy = false
    ipcRenderer.send('fi:busy', false)
  }, IDLE_LAG_MS)
}

function scheduleScan(): void {
  if (scanScheduled) return
  scanScheduled = true
  window.setTimeout(() => {
    scanScheduled = false
    report(isBusyNow())
  }, 300)
}

function startWatcher(): void {
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'title', 'class'],
  })
  window.setInterval(() => report(isBusyNow()), SCAN_INTERVAL_MS)
  report(isBusyNow())
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startWatcher, { once: true })
} else {
  startWatcher()
}
