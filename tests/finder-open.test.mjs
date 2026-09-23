// 1.1 Finder 服务——workflow 生成/安装与 fi:// 解析校验单元测试。
// 被测对象：src/main/finder-open.ts（编译产物 out/test/finder-open.js）。
// 运行前先构建：pnpm exec tsup src/main/finder-open.ts --format cjs --external electron --outDir out/test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const compiled = new URL('../out/test/finder-open.js', import.meta.url)
if (!existsSync(compiled)) {
  assert.fail('缺少编译产物 out/test/finder-open.js，先运行: pnpm exec tsup src/main/finder-open.ts --format cjs --external electron --outDir out/test')
}
const {
  parseOpenFolderUrl,
  isValidLocalFolder,
  installFinderOpenWorkflow,
  buildFinderOpenScript,
} = createRequire(import.meta.url)(compiled.pathname)

const silentLogger = { info: () => {}, warn: () => {} }
const makeHome = () => mkdtempSync(join(tmpdir(), 'fi-finder-test-'))
const trackRefresh = () => {
  const state = { calls: 0 }
  return { state, fn: () => { state.calls += 1 } }
}
// node 跑测试时 process.defaultApp 为 undefined（url 形态）；显式传 launcher 保证确定性
const EXEC_LAUNCHER = {
  mode: 'exec',
  electronPath: '/opt/electron/dist/Electron.app/Contents/MacOS/Electron',
  appRoot: '/Users/x/Code/Github/fi',
}
const URL_LAUNCHER = { mode: 'url' }

// ---------------------------------------------------------------------------
// parseOpenFolderUrl
// ---------------------------------------------------------------------------

test('parseOpenFolderUrl: 合法 URL 解码出原始路径（含中文与空格）', () => {
  const path = '/tmp/我的 项目/A b'
  assert.equal(parseOpenFolderUrl(`fi://workspace/open?path=${encodeURIComponent(path)}`), path)
})

test('parseOpenFolderUrl: 未编码的空格路径也能容错解出', () => {
  assert.equal(parseOpenFolderUrl('fi://workspace/open?path=/tmp/a b'), '/tmp/a b')
})

test('parseOpenFolderUrl: 缺 path / 空 path 返回 null', () => {
  assert.equal(parseOpenFolderUrl('fi://workspace/open'), null)
  assert.equal(parseOpenFolderUrl('fi://workspace/open?path='), null)
  assert.equal(parseOpenFolderUrl('fi://workspace/open?other=/x'), null)
})

test('parseOpenFolderUrl: host 或 path 不匹配返回 null', () => {
  assert.equal(parseOpenFolderUrl('fi://session/open?path=/x'), null)
  assert.equal(parseOpenFolderUrl('fi://workspace/create?path=/x'), null)
  assert.equal(parseOpenFolderUrl('fi://workspace/open/extra?path=/x'), null)
})

test('parseOpenFolderUrl: 非 fi scheme / 非 URL 返回 null', () => {
  assert.equal(parseOpenFolderUrl('zcode://workspace/open?path=/x'), null)
  assert.equal(parseOpenFolderUrl('not a url'), null)
  assert.equal(parseOpenFolderUrl(''), null)
})

// ---------------------------------------------------------------------------
// isValidLocalFolder
// ---------------------------------------------------------------------------

const statDir = () => ({ isDirectory: () => true })
const statFile = () => ({ isDirectory: () => false })
const statThrow = () => { throw new Error('ENOENT') }

test('isValidLocalFolder: 绝对路径且是目录 → ok', () => {
  assert.deepEqual(isValidLocalFolder('/tmp/x', statDir), { ok: true })
})

test('isValidLocalFolder: 相对路径 / 文件 / 不存在 / UNC → 拒绝', () => {
  assert.equal(isValidLocalFolder('relative/x', statDir).ok, false)
  assert.equal(isValidLocalFolder('/tmp/file.txt', statFile).ok, false)
  assert.equal(isValidLocalFolder('/tmp/gone', statThrow).ok, false)
  // 网络路径必须在任何文件系统探测之前被拒（statThrow 保证没被触碰）
  assert.equal(isValidLocalFolder('//host/share', statThrow).ok, false)
  assert.equal(isValidLocalFolder('/tmp/a\0b', statDir).ok, false)
})

// ---------------------------------------------------------------------------
// installFinderOpenWorkflow
// ---------------------------------------------------------------------------

const contentsPlist = (home) => join(home, 'Library', 'Services', 'Open in fi.workflow', 'Contents', 'Info.plist')
const contentsWflow = (home) => join(home, 'Library', 'Services', 'Open in fi.workflow', 'Contents', 'document.wflow')
const resourcesWflow = (home) => join(home, 'Library', 'Services', 'Open in fi.workflow', 'Contents', 'Resources', 'document.wflow')

test('install: 首装写齐 Info.plist 与双位置 document.wflow 并刷新索引', () => {
  const home = makeHome()
  const refresh = trackRefresh()
  installFinderOpenWorkflow({ platform: 'darwin', homeDir: home, launcher: URL_LAUNCHER, logger: silentLogger, refreshServicesIndex: refresh.fn })

  const plist = readFileSync(contentsPlist(home), 'utf8')
  assert.match(plist, /在 fi 中打开/)
  assert.match(plist, /com\.github\.xianglifei\.fi\.finder-open-workflow/)
  assert.match(plist, /public\.folder/)
  assert.match(plist, /public\.directory/)
  assert.match(plist, /com\.apple\.finder/)
  assert.match(plist, /NSServices/)

  const wflow = readFileSync(contentsWflow(home), 'utf8')
  assert.match(wflow, /Run Shell Script/)
  assert.match(wflow, /\/bin\/zsh/)
  // XML 转义后的脚本里 URL 是模板形态（${encoded} 被 &amp; 之外的实体影响的是引号）
  assert.match(wflow, /fi:\/\/workspace\/open\?path=/)
  assert.match(wflow, /encodeURIComponent/)
  assert.equal(readFileSync(resourcesWflow(home), 'utf8'), wflow)

  assert.equal(refresh.state.calls, 1)
})

test('install: 内容未变重跑不写文件、不刷新索引', () => {
  const home = makeHome()
  const refresh = trackRefresh()
  const opts = { platform: 'darwin', homeDir: home, launcher: URL_LAUNCHER, logger: silentLogger, refreshServicesIndex: refresh.fn }
  installFinderOpenWorkflow(opts)
  assert.equal(refresh.state.calls, 1)
  installFinderOpenWorkflow(opts)
  installFinderOpenWorkflow(opts)
  assert.equal(refresh.state.calls, 1)
})

test('install: 外部改动后重装会重写并再次刷新索引（自愈）', () => {
  const home = makeHome()
  const refresh = trackRefresh()
  const opts = { platform: 'darwin', homeDir: home, launcher: URL_LAUNCHER, logger: silentLogger, refreshServicesIndex: refresh.fn }
  installFinderOpenWorkflow(opts)
  appendFileSync(contentsPlist(home), '\n<!-- touched -->\n')
  writeFileSync(contentsWflow(home), 'corrupted', 'utf8')

  installFinderOpenWorkflow(opts)
  assert.equal(refresh.state.calls, 2)
  assert.ok(!readFileSync(contentsPlist(home), 'utf8').includes('touched'))
  assert.match(readFileSync(contentsWflow(home), 'utf8'), /Run Shell Script/)
})

test('install: 非 darwin 平台不安装', () => {
  const home = makeHome()
  const refresh = trackRefresh()
  installFinderOpenWorkflow({ platform: 'win32', homeDir: home, logger: silentLogger, refreshServicesIndex: refresh.fn })
  assert.equal(refresh.state.calls, 0)
  assert.equal(existsSync(join(home, 'Library')), false)
})

test('install: 写入失败只警告不抛出（不阻断启动）', () => {
  // homeDir 指向一个普通文件，mkdirSync 必然失败
  const fileAsHome = join(tmpdir(), `fi-finder-block-${Date.now()}`)
  writeFileSync(fileAsHome, 'x', 'utf8')
  const warnings = []
  installFinderOpenWorkflow({
    platform: 'darwin',
    homeDir: fileAsHome,
    logger: { info: () => {}, warn: (...args) => warnings.push(args) },
    refreshServicesIndex: () => { throw new Error('should not reach') },
  })
  assert.equal(warnings.length, 1)
})

// ---------------------------------------------------------------------------
// shell 脚本本体（两种拉起形态：语法 + 选参/编码/传参行为）
// ---------------------------------------------------------------------------

test('shell 脚本（exec/url 两形态）通过 zsh -n 语法检查', () => {
  for (const script of [buildFinderOpenScript(EXEC_LAUNCHER), buildFinderOpenScript(URL_LAUNCHER)]) {
    const res = spawnSync('/bin/zsh', ['-n', '-'], { input: script })
    assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  }
})

test('exec 形态：后台直启 Electron，参数为 appRoot 与编码后的 URL（只取第一个目录）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fi-finder-script-'))
  const file = join(dir, 'f.txt')
  writeFileSync(file, 'x', 'utf8')
  // /bin/echo 当 Electron：验证参数序与编码，绝不真拉起应用；
  // 去掉生产用的 /dev/null 重定向以便捕获输出
  const script = buildFinderOpenScript({ mode: 'exec', electronPath: '/bin/echo', appRoot: '/app root' })
    .replace(' >/dev/null 2>&1', '')

  const res = spawnSync('/bin/zsh', ['-s', '--', file, dir], { input: script })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.equal(res.stdout.toString().trim(), `/app root fi://workspace/open?path=${encodeURIComponent(dir)}`)

  // 全是非目录参数时不产出任何调用
  const none = spawnSync('/bin/zsh', ['-s', '--', file], { input: script })
  assert.equal(none.status, 0)
  assert.equal(none.stdout.toString().trim(), '')
})

test('exec 形态安装：绝对路径烘焙进 document.wflow（XML 转义后可还原）', () => {
  const home = makeHome()
  const refresh = trackRefresh()
  installFinderOpenWorkflow({ platform: 'darwin', homeDir: home, launcher: EXEC_LAUNCHER, logger: silentLogger, refreshServicesIndex: refresh.fn })
  const wflow = readFileSync(contentsWflow(home), 'utf8')
  assert.match(wflow, /\/opt\/electron\/dist\/Electron\.app\/Contents\/MacOS\/Electron/)
  assert.match(wflow, /\/Users\/x\/Code\/Github\/fi/)
  assert.match(wflow, /fi:\/\/workspace\/open\?path=/)
  assert.equal(readFileSync(resourcesWflow(home), 'utf8'), wflow)
})

test('url 形态：脚本经 /usr/bin/open 打开编码后的 URL（open 换 echo 验证）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fi-finder-script-'))
  const script = buildFinderOpenScript(URL_LAUNCHER).replace('/usr/bin/open ', 'echo ')
  const res = spawnSync('/bin/zsh', ['-s', '--', dir], { input: script })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.equal(res.stdout.toString().trim(), `fi://workspace/open?path=${encodeURIComponent(dir)}`)
})
