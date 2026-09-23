import { app, dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { DshProcess } from './dsh-process'

/**
 * Finder 右键「在 fi 中打开」：macOS Services 工作流安装 + fi:// 协议接收。
 *
 * 结构复刻 ZCode（References/ZCode/packages/desktop/src/main/desktopFinderOpenFolderWorkflow.ts）：
 * 启动时程序化把 Automator「快速操作」写进 ~/Library/Services（Run Shell Script
 * → encodeURIComponent → open "fi://workspace/open?path=…"）；fi 未打包，协议
 * 走 app.setAsDefaultProtocolClient 运行时注册（dev 态指回仓库路径）。
 * 打开动作复用 fi-sidebar 的项目模式链：workspaces.create + uiWorkspace.startSession，
 * 主进程只负责校验、确认（外部输入 gate）与投递，不在 /api 层重复建区。
 */

const SCHEME = 'fi'
const OPEN_URL_PREFIX = `${SCHEME}://`
const WORKFLOW_NAME = 'Open in fi.workflow'
const WORKFLOW_BUNDLE_ID = 'com.github.xianglifei.fi.finder-open-workflow'
const WORKFLOW_VERSION = '1'
const SERVICE_MENU_LABEL = '在 fi 中打开'

/** 导出仅为单测（zsh -n 语法检查）；安装时经 XML 转义嵌入 document.wflow。 */
export const FINDER_OPEN_SHELL_SCRIPT = `first=""
for item in "$@"; do
  if [ -d "$item" ]; then
    first="$item"
    break
  fi
done

if [ -n "$first" ]; then
  encoded=$(/usr/bin/osascript -l JavaScript -e 'function run(argv) { return encodeURIComponent(argv[0]); }' "$first")
  /usr/bin/open "${OPEN_URL_PREFIX}workspace/open?path=\${encoded}"
fi
`

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildInfoPlist(): string {
  const label = escapeXml(SERVICE_MENU_LABEL)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>English</string>
  <key>CFBundleExecutable</key>
  <string></string>
  <key>CFBundleIdentifier</key>
  <string>${WORKFLOW_BUNDLE_ID}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${label}</string>
  <key>CFBundlePackageType</key>
  <string>BNDL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>${WORKFLOW_VERSION}</string>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict>
        <key>default</key>
        <string>${label}</string>
      </dict>
      <key>NSMessage</key>
      <string>runWorkflowAsService</string>
      <key>NSRequiredContext</key>
      <dict>
        <key>NSApplicationIdentifier</key>
        <string>com.apple.finder</string>
      </dict>
      <key>NSSendFileTypes</key>
      <array>
        <string>public.folder</string>
        <string>public.directory</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`
}

function buildDocumentWorkflow(): string {
  const escapedScript = escapeXml(FINDER_OPEN_SHELL_SCRIPT)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>actions</key>
  <array>
    <dict>
      <key>action</key>
      <dict>
        <key>ActionBundlePath</key>
        <string>/System/Library/Automator/Run Shell Script.action</string>
        <key>ActionName</key>
        <string>Run Shell Script</string>
        <key>ActionParameters</key>
        <dict>
          <key>CheckedForUserDefaultShell</key>
          <true/>
          <key>COMMAND_STRING</key>
          <string>${escapedScript}</string>
          <key>inputMethod</key>
          <integer>1</integer>
          <key>shell</key>
          <string>/bin/zsh</string>
          <key>source</key>
          <string></string>
        </dict>
        <key>AMAccepts</key>
        <dict>
          <key>Container</key>
          <string>List</string>
          <key>Optional</key>
          <true/>
          <key>Types</key>
          <array>
            <string>com.apple.cocoa.path</string>
          </array>
        </dict>
        <key>AMActionVersion</key>
        <string>2.0.3</string>
        <key>AMApplication</key>
        <array>
          <string>Automator</string>
        </array>
        <key>AMParameterProperties</key>
        <dict>
          <key>CheckedForUserDefaultShell</key>
          <dict/>
          <key>COMMAND_STRING</key>
          <dict/>
          <key>inputMethod</key>
          <dict/>
          <key>shell</key>
          <dict/>
          <key>source</key>
          <dict/>
        </dict>
        <key>AMProvides</key>
        <dict>
          <key>Container</key>
          <string>List</string>
          <key>Types</key>
          <array>
            <string>com.apple.cocoa.string</string>
          </array>
        </dict>
        <key>BundleIdentifier</key>
        <string>com.apple.RunShellScript</string>
        <key>CanShowSelectedItemsWhenRun</key>
        <false/>
        <key>CanShowWhenRun</key>
        <true/>
        <key>Category</key>
        <array>
          <string>AMCategoryUtilities</string>
        </array>
        <key>CFBundleVersion</key>
        <string>2.0.3</string>
        <key>Class Name</key>
        <string>RunShellScriptAction</string>
        <key>InputUUID</key>
        <string>9F1D2C2A-4C0F-4B1E-9D5A-3E7C41D1A001</string>
        <key>Keywords</key>
        <array>
          <string>Shell</string>
          <string>Script</string>
        </array>
        <key>OutputUUID</key>
        <string>2B4A0E8D-6D93-4C77-8E1F-0A5D62B4C002</string>
        <key>UnlocalizedApplications</key>
        <array>
          <string>Automator</string>
        </array>
        <key>UUID</key>
        <string>7C3B5F17-A2E8-46D9-B0C4-1D84E7F9A003</string>
      </dict>
      <key>isViewVisible</key>
      <true/>
    </dict>
  </array>
  <key>AMApplicationBuild</key>
  <string>521</string>
  <key>AMApplicationVersion</key>
  <string>2.10</string>
  <key>AMDocumentVersion</key>
  <string>2</string>
  <key>connectors</key>
  <dict/>
  <key>workflowMetaData</key>
  <dict>
    <key>serviceApplicationBundleID</key>
    <string>com.apple.finder</string>
    <key>serviceApplicationPath</key>
    <string>/System/Library/CoreServices/Finder.app</string>
    <key>serviceInputTypeIdentifier</key>
    <string>com.apple.Automator.fileSystemObject.folder</string>
    <key>serviceOutputTypeIdentifier</key>
    <string>com.apple.Automator.nothing</string>
    <key>serviceProcessesInput</key>
    <false/>
    <key>workflowTypeIdentifier</key>
    <string>com.apple.Automator.servicesMenu</string>
  </dict>
</dict>
</plist>
`
}

function writeFileIfChanged(path: string, content: string): boolean {
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8')
    if (current === content) return false
  }
  writeFileSync(path, content, 'utf8')
  return true
}

function refreshMacServicesIndex(): void {
  const pbsPath = '/System/Library/CoreServices/pbs'
  if (!existsSync(pbsPath)) return
  const child = spawn(pbsPath, ['-update'], { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}

/**
 * 把 Finder 服务工作流装进 ~/Library/Services（幂等，内容变更时才刷新索引）。
 * 参数全部可注入：单测跑在临时目录、pbs 用 spy。
 */
export function installFinderOpenWorkflow(options: {
  platform: NodeJS.Platform
  homeDir?: string
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
  refreshServicesIndex?: () => void
}): void {
  if (options.platform !== 'darwin') return

  const servicesDir = join(options.homeDir ?? homedir(), 'Library', 'Services')
  const workflowDir = join(servicesDir, WORKFLOW_NAME)
  const contentsDir = join(workflowDir, 'Contents')
  const resourcesDir = join(contentsDir, 'Resources')

  try {
    mkdirSync(resourcesDir, { recursive: true })
    const infoChanged = writeFileIfChanged(join(contentsDir, 'Info.plist'), buildInfoPlist())
    const workflow = buildDocumentWorkflow()
    const workflowChanged = writeFileIfChanged(join(contentsDir, 'document.wflow'), workflow)
    // 用户 Automator workflow 读 Contents/document.wflow；系统内置 workflow 存在
    // Resources/document.wflow 形态。两处都写，避免 Finder 显示服务但运行时报
    // "not configured correctly"（ZCode 同款结论）。
    const resourcesChanged = writeFileIfChanged(join(resourcesDir, 'document.wflow'), workflow)
    if (infoChanged || workflowChanged || resourcesChanged) {
      // 新装/变更的工作流不刷新 pbs 索引就不出现在服务菜单里。
      ;(options.refreshServicesIndex ?? refreshMacServicesIndex)()
      options.logger.info('[finder-open] Finder 服务已安装或更新', { workflowPath: workflowDir })
    }
  } catch (error) {
    options.logger.warn('[finder-open] Finder 服务安装失败', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 注册 fi:// 协议。fi 以源码安装（未打包），LaunchServices 注册只能运行时做：
 * 每次启动重注册自愈（node_modules 重装导致 Electron 二进制挪位时注册悬空）。
 * 打包后改由 electron-builder protocols 声明接管，这里保留作兜底。
 */
export function registerFiProtocol(): void {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return
  if (process.defaultApp) {
    // electron . 形态：注册必须指回仓库路径，否则协议激活拉起的是空 Electron。
    const appRoot = resolve(process.argv[1] ?? '.')
    app.setAsDefaultProtocolClient(SCHEME, process.execPath, [appRoot])
  } else {
    app.setAsDefaultProtocolClient(SCHEME)
  }
}

// ---------------------------------------------------------------------------
// fi://workspace/open 解析与目标校验（纯函数，单测覆盖）
// ---------------------------------------------------------------------------

/** 只认 fi://workspace/open?path=<绝对路径>；其余一律 null（调用方静默忽略）。 */
export function parseOpenFolderUrl(raw: string): string | null {
  if (typeof raw !== 'string' || !raw.startsWith(OPEN_URL_PREFIX)) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.hostname !== 'workspace' || url.pathname !== '/open') return null
  const path = url.searchParams.get('path')
  if (path === null || path === '') return null
  return path
}

export function isValidLocalFolder(
  path: string,
  statFn: (path: string) => { isDirectory(): boolean } = statSync,
): { ok: true } | { ok: false; error: string } {
  if (!isAbsolute(path)) return { ok: false, error: '路径不是绝对路径' }
  // UNC 形态（//host/share）：深链是外部输入，任何文件系统探测前先拒绝。
  if (path.startsWith('//')) return { ok: false, error: '不支持网络路径' }
  if (path.includes('\0')) return { ok: false, error: '路径非法' }
  try {
    if (!statFn(path).isDirectory()) return { ok: false, error: '目标不是文件夹' }
  } catch {
    return { ok: false, error: '路径不存在或不可访问' }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 接收与投递：open-url / second-instance → 校验 → 确认 → pending → renderer
// ---------------------------------------------------------------------------

export interface OpenFolderBridge {
  /** second-instance argv 扫描（macOS dev 兜底；Windows 未来的主路径）。 */
  handleInstanceArgv(argv: string[]): void
  /** whenReady 后消费 open-url 早于 ready 到达的缓冲（macOS 冷启动）。 */
  flushQueuedUrl(): void
  /** 主窗口每次（重）建后挂 did-finish-load 投递钩子。 */
  attachWindowHooks(win: BrowserWindow): void
}

/**
 * 生命周期：确认通过的路径存 pending，在「确认时」与「窗口每次加载完成」两个
 * 时机投递 webContents.send('fi:open-workspace')；preload 侧排队兜底（事件早于
 * fi-sidebar 客户端 boot），客户端消费后回执 done 才清 pending。重复投递无害：
 * 建区幂等 + startSession 复用 blank 会话。
 */
export function registerOpenFolderBridge(options: {
  dsh: DshProcess
  getWindow: () => BrowserWindow | null
  showWindow: () => BrowserWindow
}): OpenFolderBridge {
  let queuedUrl: string | null = null
  let pendingPath: string | null = null

  function deliverPending(): void {
    if (pendingPath === null) return
    if (options.dsh.state !== 'ready') return // 状态页加载完成不算数，等 dsh URL 的下一次 did-finish-load
    const win = options.getWindow()
    if (win === null || win.isDestroyed()) return
    win.webContents.send('fi:open-workspace', { path: pendingPath })
  }

  function handleOpenUrl(url: string): void {
    const path = parseOpenFolderUrl(url)
    if (path === null) return
    const valid = isValidLocalFolder(path)
    if (!valid.ok) {
      console.warn(`[finder-open] 忽略打开请求（${valid.error}）：${path}`)
      return
    }
    // fi:// 注册后任何网页都能触发，而登记工作区是持久副作用——确认对话框
    // 必须有且取消为默认钮（对齐 ZCode deep-link gate）。
    const win = options.getWindow()
    const box = {
      type: 'warning' as const,
      buttons: ['打开', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: '在 fi 中打开',
      message: '要在 fi 中打开此文件夹吗？',
      detail: `${path}\n\n请求来自外部链接（Finder 服务或网页均可触发）。`,
    }
    const response =
      win !== null && !win.isDestroyed() ? dialog.showMessageBoxSync(win, box) : dialog.showMessageBoxSync(box)
    if (response !== 0) return
    pendingPath = path
    options.showWindow()
    deliverPending()
  }

  // macOS 主路径；冷启动时早于 ready 触发，先缓冲、whenReady 后消费。
  app.on('open-url', (event, url) => {
    if (typeof url !== 'string' || !url.startsWith(OPEN_URL_PREFIX)) return
    event.preventDefault()
    if (app.isReady()) handleOpenUrl(url)
    else queuedUrl = url
  })

  ipcMain.on('fi:open-workspace:done', () => {
    pendingPath = null
  })

  return {
    handleInstanceArgv(argv: string[]): void {
      const url = (argv ?? []).find((arg) => typeof arg === 'string' && arg.startsWith(OPEN_URL_PREFIX))
      if (url !== undefined) handleOpenUrl(url)
    },
    flushQueuedUrl(): void {
      if (queuedUrl === null) return
      const url = queuedUrl
      queuedUrl = null
      handleOpenUrl(url)
    },
    attachWindowHooks(win: BrowserWindow): void {
      win.webContents.on('did-finish-load', () => deliverPending())
    },
  }
}
