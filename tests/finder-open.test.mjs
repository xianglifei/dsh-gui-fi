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
const { parseOpenFolderUrl, isValidLocalFolder, installFinderOpenWorkflow, FINDER_OPEN_SHELL_SCRIPT } =
  createRequire(import.meta.url)(compiled.pathname)

const silentLogger = { info: () => {}, warn: () => {} }
const makeHome = () => mkdtempSync(join(tmpdir(), 'fi-finder-test-'))
const trackRefresh = () => {
  const state = { calls: 0 }
  return { state, fn: () => { state.calls += 1 } }
}

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
  installFinderOpenWorkflow({ platform: 'darwin', homeDir: home, logger: silentLogger, refreshServicesIndex: refresh.fn })

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
  const opts = { platform: 'darwin', homeDir: home, logger: silentLogger, refreshServicesIndex: refresh.fn }
  installFinderOpenWorkflow(opts)
  assert.equal(refresh.state.calls, 1)
  installFinderOpenWorkflow(opts)
  installFinderOpenWorkflow(opts)
  assert.equal(refresh.state.calls, 1)
})

test('install: 外部改动后重装会重写并再次刷新索引（自愈）', () => {
  const home = makeHome()
  const refresh = trackRefresh()
  const opts = { platform: 'darwin', homeDir: home, logger: silentLogger, refreshServicesIndex: refresh.fn }
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
// shell 脚本本体（语法 + URL 构造行为）
// ---------------------------------------------------------------------------

test('shell 脚本通过 zsh -n 语法检查', () => {
  const res = spawnSync('/bin/zsh', ['-n', '-'], { input: FINDER_OPEN_SHELL_SCRIPT })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
})

test('shell 脚本只取第一个目录参数并产出编码正确的 fi:// URL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fi-finder-script-'))
  const file = join(dir, 'f.txt')
  writeFileSync(file, 'x', 'utf8')
  // 把真实 open 换成 echo：验证选参与编码逻辑，绝不触发系统协议拉起应用
  const script = FINDER_OPEN_SHELL_SCRIPT.replace('/usr/bin/open ', 'echo ')

  const res = spawnSync('/bin/zsh', ['-s', '--', file, dir], { input: script })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.equal(res.stdout.toString().trim(), `fi://workspace/open?path=${encodeURIComponent(dir)}`)

  // 全是非目录参数时不产出 URL
  const none = spawnSync('/bin/zsh', ['-s', '--', file], { input: script })
  assert.equal(none.status, 0)
  assert.equal(none.stdout.toString().trim(), '')
})
