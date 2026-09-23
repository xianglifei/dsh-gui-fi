// 侧栏插件 fi-sidebar——模块加载 + 纯逻辑单元测试。
// 被测对象：dsh-plugin/lib/client.js（真实源码，在桩环境中加载后提取内部纯函数）。
// 覆盖：0.2 任务列表/搜索合并、0.4 图标表、0.5 面板筛选与调度文案、启动钉子、
// 词典完整性、0.8 项目任务分组（deriveProjectGroups）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../dsh-plugin/lib/client.js', import.meta.url), 'utf8')

// ---------------------------------------------------------------------------
// 桩环境加载：window.__ModuleLoader__.load 工厂在无 DOM/React 的环境里执行
// ---------------------------------------------------------------------------

function loadPlugin() {
  const loads = []
  const windowStub = { __ModuleLoader__: { load: (spec) => loads.push(spec) } }
  const documentStub = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild() {} },
  }
  new Function('window', 'document', 'navigator', source)(windowStub, documentStub, {})
  assert.equal(loads.length, 1, '恰好注册一个模块')
  const spec = loads[0]
  const stubs = {
    react: { useState: () => [null, () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useMemo: (fn) => fn(), useCallback: (fn) => fn },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: {} },
    'react-dom': { createPortal: () => null },
    '@deepseek-ai/dsh-client-ui-primitives': { Tooltip: () => null },
  }
  return { id: spec.id, exports: spec.factory((name) => stubs[name]) }
}

function extractFn(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `源码中找到 function ${name}`)
  let depth = 0
  let i = source.indexOf('{', start)
  for (let j = i; j < source.length; j++) {
    if (source[j] === '{') depth++
    else if (source[j] === '}') { depth--; if (depth === 0) return source.slice(start, j + 1) }
  }
  assert.fail(`括号配平失败: ${name}`)
}

/** 组装提取出的纯函数 + 依赖常量为可调用模块。 */
const pureFns = new Function(`
  const DEFAULT_WORKSPACE_TITLE = 'default';
  ${extractFn('format')}
  ${extractFn('deriveRows')}
  ${extractFn('deriveProjectGroups')}
  ${extractFn('deriveSearchRows')}
  ${extractFn('relativeTime')}
  ${extractFn('guardFinderOpen')}
  ${extractFn('cronHasFailure')}
  ${extractFn('cronStatusKind')}
  ${extractFn('cronFilterKind')}
  ${extractFn('cronScheduleText')}
  ${extractFn('cronFutureRelative')}
  ${extractFn('placeToggleHost')}
  const pad2 = (v) => String(v).padStart(2, '0');
  const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  return { format, deriveRows, deriveProjectGroups, deriveSearchRows, relativeTime, guardFinderOpen, cronHasFailure, cronStatusKind, cronFilterKind, cronScheduleText, cronFutureRelative, placeToggleHost };
`)()

// 从 apply() 里捕获真实词典（zh/en）与全部槽位注册
const plugin = loadPlugin()
const captured = { slotNames: [], registrations: [] }
plugin.exports.apply({
  get: () => ({ list: { getSnapshot: () => ({ items: [] }), subscribe: () => () => {} } }),
  effect: (fn) => fn(),
  locale: { register: (ns, dicts) => { captured.ns = ns; captured.dicts = dicts } },
  slots: {
    inject: (name, factory) => { captured.slotNames.push(name); factory() },
    register: (options, component) => { captured.registrations.push({ options, component }); return () => {} },
  },
})
const zh = captured.dicts.zh
const en = captured.dicts.en
const t = (key) => zh[key] ?? key

// ---------------------------------------------------------------------------
// 模块与接线
// ---------------------------------------------------------------------------

test('模块按 dsh 客户端模块格式注册，id 为 fi-sidebar', () => {
  assert.equal(plugin.id, 'fi-sidebar')
})

test('exports 声明的 inject 面与实现一致', () => {
  assert.deepEqual(plugin.exports.inject, ['slots', 'locale', 'uiWorkspace', 'workspaces', 'sessions'])
})

test('apply(): 注册 fiSidebar 词典 + 以 sidebar.workspaces 槽位影子接管', () => {
  assert.equal(captured.ns, 'fiSidebar')
  assert.ok(captured.slotNames.includes('sidebar.workspaces'))
})

test('apply(): 注册 sidebar.brand.name 空渲染——去掉「deepseek HARNESS」文字标', () => {
  const reg = captured.registrations.find((r) => r.options.name === 'sidebar.brand.name')
  assert.ok(reg, '找到 sidebar.brand.name 注册')
  assert.equal(reg.options.priority, -1, '影子接管优先级')
  assert.equal(typeof reg.component, 'function', '组件是可调用函数')
  assert.equal(reg.component(), null, '渲染为空：single 槽位有注册项即不再走文字 fallback')
})

// ---------------------------------------------------------------------------
// 启动钉子（冷启动固定到 default 工作区，不再跟着 dsh「最近活动」走）
// ---------------------------------------------------------------------------

/**
 * 独立装一次插件，拿到可驱动的 workspaces/sessions 列表桩与 startSession 记录。
 * set() 更新快照并通知订阅者，模拟 dsh store 的就绪与后续更新。
 */
function bootPinHarness() {
  const calls = []
  const mkList = () => {
    const listeners = new Set()
    const store = {
      snapshot: { phase: 'loading', items: [], ids: [], byId: {}, current: undefined, archivedSessionIds: [] },
      getSnapshot: () => store.snapshot,
      subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
      set: (next) => { store.snapshot = next; for (const fn of [...listeners]) fn() },
    }
    return store
  }
  const workspaces = { list: mkList() }
  const sessions = { list: mkList() }
  loadPlugin().exports.apply({
    get: (name) => ({ workspaces, sessions, uiWorkspace: { startSession: (id) => calls.push(id) } })[name],
    effect: (fn) => fn(),
    locale: { register: () => {} },
    slots: { inject: () => {}, register: () => ({}) },
  })
  return { workspaces, sessions, calls }
}

const wsApp = { title: 'Applications', workspaceId: 'ws-app', sessionIds: ['b1'] }
const wsDefault = { title: 'default', workspaceId: 'ws-def', sessionIds: ['d1'] }
const sessionsReady = (extra = {}) => ({
  phase: 'ready', ids: [], byId: {}, current: undefined, archivedSessionIds: [], ...extra,
})

test('启动钉子：两库就绪且无当前会话 → 钉到 default，且只钉一次', () => {
  const h = bootPinHarness()
  h.workspaces.list.set({ phase: 'ready', items: [wsApp, wsDefault], archivedSessionIds: [] })
  assert.deepEqual(h.calls, [], 'sessions 未就绪时不触发')
  h.sessions.list.set(sessionsReady())
  assert.deepEqual(h.calls, ['ws-def'])
  h.sessions.list.set(sessionsReady()) // 快照再抖动不重钉
  assert.deepEqual(h.calls, ['ws-def'])
})

test('启动钉子：default 晚到时，dsh 兜底开在别处的空白会话被改钉', () => {
  const h = bootPinHarness()
  h.workspaces.list.set({ phase: 'ready', items: [wsApp], archivedSessionIds: [] })
  h.sessions.list.set(sessionsReady({ ids: ['b1'], byId: { b1: { id: 'b1', blank: true } }, current: 'b1' }))
  assert.deepEqual(h.calls, [], 'default 尚未 ensure 出来时不触发')
  h.workspaces.list.set({ phase: 'ready', items: [wsApp, wsDefault], archivedSessionIds: [] })
  assert.deepEqual(h.calls, ['ws-def'])
})

test('启动钉子：用户已在真实会话（非 blank）上时不动', () => {
  const h = bootPinHarness()
  h.workspaces.list.set({ phase: 'ready', items: [wsApp, wsDefault], archivedSessionIds: [] })
  h.sessions.list.set(sessionsReady({ ids: ['r1'], byId: { r1: { id: 'r1', blank: false } }, current: 'r1' }))
  assert.deepEqual(h.calls, [])
})

test('启动钉子：当前会话已在 default 工作区内时不重钉', () => {
  const h = bootPinHarness()
  h.workspaces.list.set({ phase: 'ready', items: [wsApp, wsDefault], archivedSessionIds: [] })
  h.sessions.list.set(sessionsReady({ ids: ['d1'], byId: { d1: { id: 'd1', blank: true } }, current: 'd1' }))
  assert.deepEqual(h.calls, [])
})

test('启动钉子：default 一直缺失（服务端 ensure 失败）时退化为 dsh 原生行为', () => {
  const h = bootPinHarness()
  h.workspaces.list.set({ phase: 'ready', items: [wsApp], archivedSessionIds: [] })
  h.sessions.list.set(sessionsReady())
  assert.deepEqual(h.calls, [])
})

// ---------------------------------------------------------------------------
// Finder 深链守位（guardFinderOpen：防 dsh 一次性启动恢复把我们翻回 default）
// ---------------------------------------------------------------------------

/** 可注入时钟与订阅桩的守位测试台：advance 推进时间并触发到期定时器。 */
function guardHarness() {
  let now = 1_000
  const timers = []
  const calls = []
  const createCalls = []
  const mkList = () => {
    const listeners = new Set()
    const store = {
      snapshot: { phase: 'loading', items: [], ids: [], byId: {}, current: undefined, archivedSessionIds: [] },
      getSnapshot: () => store.snapshot,
      subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
      set: (next) => { store.snapshot = next; for (const fn of [...listeners]) fn() },
    }
    return store
  }
  const deps = {
    workspaces: { list: mkList() },
    sessions: {
      list: mkList(),
      create: (opts) => { createCalls.push(opts); return Promise.resolve({ ok: true, value: { sessionId: 't2' } }) },
    },
    uiWorkspace: {
      startSession: (id) => calls.push(`start:${id}`),
      openSession: (id) => calls.push(`open:${id}`),
    },
  }
  const advance = (ms) => {
    now += ms
    for (const timer of timers.filter((x) => x.at <= now && !x.fired)) {
      timer.fired = true
      timer.fn()
    }
  }
  return {
    deps,
    calls,
    createCalls,
    advance,
    flush: () => new Promise((r) => setImmediate(r)),
    run: (ws) => pureFns.guardFinderOpen(deps, ws, {
      now: () => now,
      setTimeout: (fn, ms) => timers.push({ fn, at: now + ms, fired: false }),
    }),
  }
}

const gTarget = { workspaceId: 'ws-tgt', path: '/tmp/tgt', sessionIds: [] }
const gWsReady = (targetIds = ['t1']) => ({
  phase: 'ready',
  archivedSessionIds: [],
  items: [
    { title: 'default', workspaceId: 'ws-def', sessionIds: ['d1'] },
    { title: 'tgt', workspaceId: 'ws-tgt', sessionIds: targetIds },
  ],
})
const gSessions = (current, byId = { d1: { id: 'd1', blank: true }, t1: { id: 't1', blank: true } }) => ({
  phase: 'ready', ids: Object.keys(byId), byId, current, archivedSessionIds: [],
})

test('守位：自己的切换未落地前，current 停在 default 空白是正常中间态 → 不纠正', async () => {
  const h = guardHarness()
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('d1'))
  h.run(gTarget)
  // 自有导航挂起期间的快照抖动（多次 default 空白）都不能烧纠正额度
  for (let i = 0; i < 5; i++) h.deps.sessions.list.set(gSessions('d1'))
  h.advance(500) // settle 定时器
  await h.flush()
  assert.deepEqual(h.calls, [], '落地前一律无视')
  assert.deepEqual(h.createCalls, [])
  // 切换落地 → 进入盯防
  h.deps.sessions.list.set(gSessions('t1'))
  // 随后 dsh 启动恢复翻回 default 空白 → 纠正（额度未被烧掉）
  h.deps.sessions.list.set(gSessions('d1'))
  await h.flush()
  assert.deepEqual(h.createCalls, [{ workspaceId: 'ws-tgt' }], '优先 sessions.create 全新 RPC（绕开 inflight 表）')
  assert.deepEqual(h.calls, ['open:t2'], '成功后 openSession 直达 replaceMain')
})

test('守位：落地后当前已稳定在目标 → settle 到期也不纠正', async () => {
  const h = guardHarness()
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  h.run(gTarget)
  h.advance(11_000)
  await h.flush()
  assert.deepEqual(h.calls, [])
})

test('守位：落地后被翻回 default 空白 → 重钉目标工作区', async () => {
  const h = guardHarness()
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  h.run(gTarget)
  h.deps.sessions.list.set(gSessions('d1'))
  await h.flush()
  assert.deepEqual(h.calls, ['open:t2'], '订阅触发即纠正')
  h.deps.sessions.list.set(gSessions('t2'))
  assert.deepEqual(h.calls, ['open:t2'], '纠正生效后不再动作')
})

test('守位：create 失败（RemoteResult not ok）→ 回退 startSession', async () => {
  const h = guardHarness()
  h.deps.sessions.create = () => Promise.resolve({ ok: false, error: { code: 'x', message: 'nope' } })
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  h.run(gTarget)
  h.deps.sessions.list.set(gSessions('d1'))
  await h.flush()
  assert.deepEqual(h.calls, ['start:ws-tgt'])
})

test('守位：create 抛错 → 回退 startSession', async () => {
  const h = guardHarness()
  h.deps.sessions.create = () => Promise.reject(new Error('transport'))
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  h.run(gTarget)
  h.deps.sessions.list.set(gSessions('d1'))
  await h.flush()
  assert.deepEqual(h.calls, ['start:ws-tgt'])
})

test('守位：sessions.create 面不可用 → 直接 startSession', async () => {
  const h = guardHarness()
  delete h.deps.sessions.create
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  h.run(gTarget)
  h.deps.sessions.list.set(gSessions('d1'))
  await h.flush()
  assert.deepEqual(h.calls, ['start:ws-tgt'])
})

test('守位：落地后 current 消失 → 纠正', async () => {
  const h = guardHarness()
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  h.run(gTarget)
  h.deps.sessions.list.set(gSessions(undefined))
  await h.flush()
  assert.deepEqual(h.calls, ['open:t2'])
})

test('守位：用户停在真实会话（非 blank）→ 不打扰', async () => {
  const h = guardHarness()
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  h.run(gTarget)
  h.deps.sessions.list.set(gSessions('d1', { d1: { id: 'd1', blank: false } }))
  await h.flush()
  assert.deepEqual(h.calls, [], 'default 里的真实会话不动')
  h.deps.sessions.list.set(gSessions('b1', { b1: { id: 'b1', blank: true } }))
  await h.flush()
  assert.deepEqual(h.calls, [], '不在任何工作区的会话（快照抖动）不动')
})

test('守位：连续被翻回受纠正次数约束（≤3），避免与用户导航打架', async () => {
  const h = guardHarness()
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  h.run(gTarget)
  for (let i = 0; i < 5; i++) h.deps.sessions.list.set(gSessions('d1'))
  await h.flush()
  assert.equal(h.createCalls.length, 3, '上限后不再纠正')
})

test('守位：落地窗口（10s）过后不再纠正', async () => {
  const h = guardHarness()
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  h.run(gTarget)
  h.advance(11_000)
  h.deps.sessions.list.set(gSessions('d1'))
  await h.flush()
  assert.deepEqual(h.calls, [], '窗口过后掉回也不纠正')
})

test('守位：返回取消函数，撤销后退订不再纠正', async () => {
  const h = guardHarness()
  h.deps.workspaces.list.set(gWsReady())
  h.deps.sessions.list.set(gSessions('t1'))
  const stop = h.run(gTarget)
  stop()
  h.deps.sessions.list.set(gSessions('d1'))
  await h.flush()
  assert.deepEqual(h.calls, [])
})

// ---------------------------------------------------------------------------
// 词典完整性（0.2–0.5 全部 UI 文案）
// ---------------------------------------------------------------------------

test('zh / en 词典键完全一致（无缺漏）', () => {
  const zhKeys = Object.keys(zh).sort()
  const enKeys = Object.keys(en).sort()
  assert.deepEqual(zhKeys, enKeys, `差集: ${zhKeys.filter((k) => !(k in en)).concat(enKeys.filter((k) => !(k in zh))).join(', ')}`)
})

test('源码里每个 t("…") 字面量键在两份词典中都存在', () => {
  const used = new Set()
  for (const m of source.matchAll(/\bt\("([a-zA-Z0-9.]+)"\)/g)) used.add(m[1])
  assert.ok(used.size > 80, `扫描到的键数量合理（实际 ${used.size}）`)
  for (const key of used) {
    assert.ok(key in zh, `zh 缺键: ${key}`)
    assert.ok(key in en, `en 缺键: ${key}`)
  }
})

test('cron.weekday.0–6 动态键齐全', () => {
  for (let d = 0; d <= 6; d++) {
    assert.ok(`cron.weekday.${d}` in zh && `cron.weekday.${d}` in en, `weekday ${d}`)
  }
})

// ---------------------------------------------------------------------------
// 0.4 图标表
// ---------------------------------------------------------------------------

function evalObject(varName) {
  const start = source.indexOf(`const ${varName} = {`)
  assert.ok(start >= 0, `找到 const ${varName}`)
  let depth = 0
  let i = source.indexOf('{', start)
  for (let j = i; j < source.length; j++) {
    if (source[j] === '{') depth++
    else if (source[j] === '}') { depth--; if (depth === 0) return (0, eval)(`(${source.slice(i, j + 1)})`) }
  }
  assert.fail(`括号配平失败: ${varName}`)
}

test('ICONS 引用的名字全部在 LUCIDE_INNER 表中（0.4 全量 Lucide 化）', () => {
  const icons = evalObject('ICONS')
  const lucide = evalObject('LUCIDE_INNER')
  for (const [key, name] of Object.entries(icons)) {
    assert.ok(name in lucide, `ICONS.${key} = "${name}" 不在 LUCIDE_INNER`)
  }
  // CHANGELOG 0.4.0 点名的关键替换
  assert.equal(icons.plugins, 'blocks')
  assert.equal(icons.refresh, 'rotate-cw')
  assert.equal(icons.newTaskHere, 'message-circle-plus')
  // 0.5.0 点名的眼睛开关
  assert.equal(icons.eye, 'eye')
  assert.equal(icons.eyeClosed, 'eye-closed')
  // 0.7 插件中心的安装与仓库外链
  assert.equal(icons.pluginInstall, 'download')
  assert.equal(icons.pluginRepo, 'external-link')
  assert.equal(icons.pluginRemove, 'trash-2')
  // 0.8 项目任务显隐开关（关=folder-dot，开=folder-open-dot）
  assert.equal(icons.projectsOff, 'folder-dot')
  assert.equal(icons.projectsOn, 'folder-open-dot')
})

// ---------------------------------------------------------------------------
// 0.7 插件中心推荐表
// ---------------------------------------------------------------------------

/** 提取 const 数组声明（到首个 `];`），供词典联动断言。 */
function extractRecommended() {
  const start = source.indexOf('const RECOMMENDED_PLUGINS = [')
  assert.ok(start >= 0, '源码中找到 RECOMMENDED_PLUGINS')
  const end = source.indexOf('];', start)
  return (0, eval)(`(${source.slice(start + 'const RECOMMENDED_PLUGINS = '.length, end + 1)})`)
}

test('RECOMMENDED_PLUGINS：字段齐全、名字唯一、repo 为 GitHub https 链接', () => {
  const recs = extractRecommended()
  assert.ok(recs.length >= 1, '推荐表非空')
  const names = new Set()
  for (const rec of recs) {
    assert.match(rec.name, /^[\w@][\w./-]*$/, `包名合法: ${rec.name}`)
    assert.ok(typeof rec.spec === 'string' && rec.spec !== '', `spec 非空: ${rec.name}`)
    assert.match(rec.version, /^\d+\.\d+\.\d+/, `version 是语义化版本: ${rec.name}`)
    assert.match(rec.repo, /^https:\/\/github\.com\//, `repo 是 GitHub 链接: ${rec.name}`)
    names.add(rec.name)
  }
  assert.equal(names.size, recs.length, '推荐位名字不重复')
})

test('每个推荐插件的一句话介绍词条（plugin.rec.<name>.desc）在两份词典中存在', () => {
  for (const rec of extractRecommended()) {
    assert.ok(`plugin.rec.${rec.name}.desc` in zh, `zh 缺 plugin.rec.${rec.name}.desc`)
    assert.ok(`plugin.rec.${rec.name}.desc` in en, `en 缺 plugin.rec.${rec.name}.desc`)
  }
})

test('插件中心全部词条在两份词典中齐全（plugin.* 固定键）', () => {
  for (const key of ['plugin.title', 'plugin.subtitle', 'plugin.refresh', 'plugin.installed',
    'plugin.installed.empty', 'plugin.recommended', 'plugin.install', 'plugin.installing',
    'plugin.installedBadge', 'plugin.installedNote', 'plugin.installFailed', 'plugin.desktopOnly', 'plugin.repo',
    'plugin.uninstall', 'plugin.uninstallConfirm', 'plugin.uninstalledNote', 'plugin.uninstallFailed']) {
    assert.ok(key in zh, `zh 缺 ${key}`)
    assert.ok(key in en, `en 缺 ${key}`)
  }
})

test('LUCIDE_INNER 每个 path 都是合法 SVG 片段（<path>/<circle>/<rect>）', () => {
  const lucide = evalObject('LUCIDE_INNER')
  assert.ok(Object.keys(lucide).length >= 18, '图标数量级合理')
  for (const [name, inner] of Object.entries(lucide)) {
    assert.match(inner, /^<(path|circle|rect)\b/, `${name} 以 SVG 图元开头`)
    assert.ok(/^\s*$/.test(inner.replace(/<[^>]+>/g, '')), `${name} 只含 SVG 标签`)
  }
})

// ---------------------------------------------------------------------------
// 0.2 任务列表（deriveRows）
// ---------------------------------------------------------------------------

const mkSession = (id, updatedAt, extra = {}) => ({
  id, updatedAt, origin: 'root', blank: false, displayTitle: `t-${id}`, ...extra,
})
const mkSnapshots = (sessionList, workspaceList) => ({
  sessions: { phase: 'ready', byId: Object.fromEntries(sessionList.map((s) => [s.id, s])), current: sessionList[0]?.id ?? null },
  workspaces: { phase: 'ready', items: workspaceList, archivedSessionIds: [] },
})

test('deriveRows: 快照未就绪返回 null', () => {
  assert.equal(pureFns.deriveRows({ phase: 'loading' }, { phase: 'ready' }), null)
})

test('deriveRows: default 工作区缺失返回空数组（退化为空列表）', () => {
  const { sessions, workspaces } = mkSnapshots([mkSession('a', 100)], [{ title: '别的工作区', sessionIds: ['a'] }])
  assert.deepEqual(pureFns.deriveRows(sessions, workspaces), [])
})

test('deriveRows: 按最近更新倒序；排除子代理/归档/非当前 blank；保留当前 blank', () => {
  const list = [
    mkSession('old', 100),
    mkSession('new', 300),
    mkSession('mid', 200),
    mkSession('sub', 400, { origin: 'subagent' }),
    mkSession('archived', 500, {}),
    mkSession('blank-other', 600, { blank: true }),
  ]
  const { sessions, workspaces } = mkSnapshots(list, [{ title: 'default', sessionIds: list.map((s) => s.id) }])
  sessions.byId['archived'].id = 'archived'
  workspaces.archivedSessionIds = ['archived']
  const rows = pureFns.deriveRows(sessions, workspaces)
  assert.deepEqual(rows.map((r) => r.id), ['new', 'mid', 'old']) // current=a 不在 default 里也不该出现 blank-other
})

test('deriveRows: blank 会话是当前会话时保留', () => {
  const list = [mkSession('blank-cur', 600, { blank: true }), mkSession('other', 100)]
  const { sessions, workspaces } = mkSnapshots(list, [{ title: 'default', sessionIds: ['blank-cur', 'other'] }])
  const rows = pureFns.deriveRows(sessions, workspaces)
  assert.deepEqual(rows.map((r) => r.id), ['blank-cur', 'other'])
})

test('deriveRows: updatedAt 相同按 id 升序稳定排序', () => {
  const list = [mkSession('b', 100), mkSession('a', 100), mkSession('c', 100)]
  const { sessions, workspaces } = mkSnapshots(list, [{ title: 'default', sessionIds: ['b', 'a', 'c'] }])
  assert.deepEqual(pureFns.deriveRows(sessions, workspaces).map((r) => r.id), ['a', 'b', 'c'])
})

// ---------------------------------------------------------------------------
// 0.8 项目任务分组（deriveProjectGroups，普通模式「显示项目任务」展开用）
// ---------------------------------------------------------------------------

test('deriveProjectGroups: 快照未就绪返回 null', () => {
  assert.equal(pureFns.deriveProjectGroups({ phase: 'loading' }, { phase: 'ready' }), null)
  assert.equal(pureFns.deriveProjectGroups({ phase: 'ready' }, { phase: 'loading' }), null)
})

test('deriveProjectGroups: 非 default 工作区各成一组，组内可见性与 deriveRows 同一套', () => {
  const list = [
    mkSession('def', 900),                                  // default 的行不进分组
    mkSession('p1-new', 300),
    mkSession('p1-old', 100),
    mkSession('p1-sub', 400, { origin: 'subagent' }),       // 子代理排除
    mkSession('p1-arch', 500),                              // 归档排除
    mkSession('p1-blank', 600, { blank: true }),            // 非当前 blank 排除
  ]
  const { sessions, workspaces } = mkSnapshots(list, [
    { title: 'default', workspaceId: 'ws-def', sessionIds: ['def'] },
    { title: 'proj-a', workspaceId: 'ws-a', sessionIds: ['p1-sub', 'p1-arch', 'p1-blank', 'p1-old', 'p1-new'] },
  ])
  sessions.byId['p1-arch'].id = 'p1-arch'
  workspaces.archivedSessionIds = ['p1-arch']
  const groups = pureFns.deriveProjectGroups(sessions, workspaces)
  assert.deepEqual(groups.map((g) => g.title), ['proj-a'])
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['p1-new', 'p1-old'])
})

test('deriveProjectGroups: blank 会话是当前会话时保留（在文件夹里刚建的任务切回普通模式仍可见）', () => {
  const list = [mkSession('p-blank', 600, { blank: true }), mkSession('p-real', 100)]
  const { sessions, workspaces } = mkSnapshots(list, [
    { title: 'default', workspaceId: 'ws-def', sessionIds: [] },
    { title: 'proj-a', workspaceId: 'ws-a', sessionIds: ['p-blank', 'p-real'] },
  ])
  const groups = pureFns.deriveProjectGroups(sessions, workspaces)
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['p-blank', 'p-real'])
})

test('deriveProjectGroups: 没有可见会话的工作区整组不出现；组间按组内最新活动倒序', () => {
  const list = [
    mkSession('a1', 100),
    mkSession('b1', 500),
    mkSession('b2', 50),
    mkSession('c-blank', 700, { blank: true }), // empty-ws 里唯一的行不可见 → 整组消失
  ]
  const { sessions, workspaces } = mkSnapshots(list, [
    { title: 'default', workspaceId: 'ws-def', sessionIds: [] },
    { title: 'proj-a', workspaceId: 'ws-a', sessionIds: ['a1'] },
    { title: 'proj-b', workspaceId: 'ws-b', sessionIds: ['b1', 'b2'] },
    { title: 'empty-ws', workspaceId: 'ws-e', sessionIds: ['c-blank'] },
  ])
  const groups = pureFns.deriveProjectGroups(sessions, workspaces)
  assert.deepEqual(groups.map((g) => g.id), ['ws-b', 'ws-a'])
  assert.deepEqual(groups[1].rows.map((r) => r.id), ['a1'])
})

test('deriveProjectGroups: 组内 updatedAt 相同按 id 升序、组间最新时间相同按 id 升序稳定排序', () => {
  const list = [mkSession('x1', 100), mkSession('x0', 100), mkSession('y1', 100), mkSession('y0', 100)]
  const { sessions, workspaces } = mkSnapshots(list, [
    { title: 'proj-x', workspaceId: 'ws-x', sessionIds: ['x1', 'x0'] },
    { title: 'proj-y', workspaceId: 'ws-y', sessionIds: ['y1', 'y0'] },
  ])
  const groups = pureFns.deriveProjectGroups(sessions, workspaces)
  assert.deepEqual(groups.map((g) => g.id), ['ws-x', 'ws-y'])
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['x0', 'x1'])
})

// ---------------------------------------------------------------------------
// 0.3 搜索合并（deriveSearchRows）
// ---------------------------------------------------------------------------

function searchSetup() {
  const list = [
    mkSession('alpha-report', 400, { displayTitle: 'Quarterly Report' }),
    mkSession('beta', 300, { displayTitle: '周会记录' }),
    mkSession('gamma', 200, { displayTitle: 'random notes' }),
    mkSession('delta', 100, { displayTitle: 'Report draft' }),
  ]
  const workspaces = [
    { title: 'default', sessionIds: ['alpha-report', 'beta'] },
    { title: 'proj-x', sessionIds: ['gamma', 'delta'] },
  ]
  return mkSnapshots(list, workspaces)
}

test('deriveSearchRows: 空查询返回空集', () => {
  const { sessions, workspaces } = searchSetup()
  assert.deepEqual(pureFns.deriveSearchRows(sessions, workspaces, '  ', null, 20), { rows: [], hasMore: false })
})

test('deriveSearchRows: 标题大小写不敏感匹配，按最近更新倒序；default 行不带工作区名', () => {
  const { sessions, workspaces } = searchSetup()
  const { rows } = pureFns.deriveSearchRows(sessions, workspaces, 'report', null, 20)
  assert.deepEqual(rows.map((r) => r.session.id), ['alpha-report', 'delta'])
  assert.equal(rows[0].label, undefined) // default 工作区
  assert.equal(rows[1].label, 'proj-x')
})

test('deriveSearchRows: 工作区名匹配命中其下会话', () => {
  const { sessions, workspaces } = searchSetup()
  const { rows } = pureFns.deriveSearchRows(sessions, workspaces, 'proj', null, 20)
  assert.deepEqual(rows.map((r) => r.session.id), ['gamma', 'delta'])
})

test('deriveSearchRows: 内容命中去重后追加在本地命中之后，摘要取首条内容项', () => {
  const { sessions, workspaces } = searchSetup()
  const content = {
    items: [
      { sessionId: 'gamma', snippet: ' mentions report inside' },
      { sessionId: 'alpha-report', snippet: 'dup should not repeat' },
      { sessionId: 'gamma', snippet: 'second snippet ignored' },
    ],
    hasMore: false,
  }
  const { rows } = pureFns.deriveSearchRows(sessions, workspaces, 'report', content, 20)
  assert.deepEqual(rows.map((r) => r.session.id), ['alpha-report', 'delta', 'gamma'])
  assert.equal(rows[2].snippet, ' mentions report inside')
})

test('deriveSearchRows: 排除子代理/归档/blank 的内容命中', () => {
  const list = [
    mkSession('ok', 400), mkSession('sub', 500, { origin: 'subagent' }),
    mkSession('arc', 600), mkSession('blk', 700, { blank: true }),
  ]
  const { sessions, workspaces } = mkSnapshots(list, [{ title: 'default', sessionIds: list.map((s) => s.id) }])
  workspaces.archivedSessionIds = ['arc']
  const content = { items: list.map((s) => ({ sessionId: s.id, snippet: 'x' })), hasMore: false }
  const { rows } = pureFns.deriveSearchRows(sessions, workspaces, 'x', content, 20)
  assert.deepEqual(rows.map((r) => r.session.id), ['ok']) // 标题 't-x' 全命中但过滤后只剩 ok
})

test('deriveSearchRows: 超出 limit 截断；本地溢出与后端 hasMore 都置提示', () => {
  const { sessions, workspaces } = searchSetup()
  // content=null（防抖窗口内/后端降级）：本地 2 条命中截到 1，同样提示
  const localOnly = pureFns.deriveSearchRows(sessions, workspaces, 'report', null, 1)
  assert.equal(localOnly.rows.length, 1)
  assert.equal(localOnly.hasMore, true)
  // content 参与且未溢出：无提示
  const exact = pureFns.deriveSearchRows(sessions, workspaces, 'report', { items: [], hasMore: false }, 20)
  assert.equal(exact.hasMore, false)
})

test('deriveSearchRows: 后端 hasMore 透传', () => {
  const { sessions, workspaces } = searchSetup()
  const r = pureFns.deriveSearchRows(sessions, workspaces, 'report', { items: [], hasMore: true }, 20)
  assert.equal(r.hasMore, true)
})

// ---------------------------------------------------------------------------
// 0.3 相对时间
// ---------------------------------------------------------------------------

test('relativeTime: 分钟/小时/天/月/年分档', () => {
  const now = Date.now()
  assert.equal(pureFns.relativeTime(now - 10_000, t), '刚刚')
  assert.equal(pureFns.relativeTime(now - 5 * 60_000, t), '5分钟')
  assert.equal(pureFns.relativeTime(now - 3 * 3_600_000, t), '3小时')
  assert.equal(pureFns.relativeTime(now - 2 * 86_400_000, t), '2天')
  assert.equal(pureFns.relativeTime(now - 40 * 86_400_000, t), '1个月')
  assert.equal(pureFns.relativeTime(now - 400 * 86_400_000, t), '1年')
})

// ---------------------------------------------------------------------------
// 0.5 面板筛选与状态判定
// ---------------------------------------------------------------------------

const mkTask = (extra = {}) => ({
  lifecycleStatus: 'active', enabled: true, lastError: null, schedule: { unit: 'minute', interval: 15 },
  nextRunAt: null, runCount: 3, ...extra,
})

test('状态判定：failed/completed/paused/active 四态', () => {
  assert.equal(pureFns.cronStatusKind(mkTask({ lifecycleStatus: 'failed' })), 'failed')
  assert.equal(pureFns.cronStatusKind(mkTask({ lifecycleStatus: 'completed' })), 'completed')
  assert.equal(pureFns.cronStatusKind(mkTask({ lifecycleStatus: 'paused' })), 'paused')
  assert.equal(pureFns.cronStatusKind(mkTask({ enabled: false })), 'paused') // enabled=false 视作暂停
  assert.equal(pureFns.cronStatusKind(mkTask()), 'active')
})

test('筛选归组：lastError 痕迹归失败档；active 与 paused 都算进行中', () => {
  assert.equal(pureFns.cronFilterKind(mkTask()), 'inProgress')
  assert.equal(pureFns.cronFilterKind(mkTask({ lifecycleStatus: 'paused' })), 'inProgress')
  assert.equal(pureFns.cronFilterKind(mkTask({ lastError: 'boom' })), 'failed') // 循环任务失败痕迹
  assert.equal(pureFns.cronFilterKind(mkTask({ lifecycleStatus: 'failed' })), 'failed')
  assert.equal(pureFns.cronFilterKind(mkTask({ lifecycleStatus: 'completed' })), 'completed')
})

test('调度摘要文案：四种节奏（中文）', () => {
  assert.equal(pureFns.cronScheduleText(mkTask(), t), '每 15 分钟')
  assert.equal(pureFns.cronScheduleText(mkTask({ schedule: { unit: 'day', interval: 1, hour: 9, minute: 5 } }), t), '每天 09:05')
  assert.equal(pureFns.cronScheduleText(mkTask({ schedule: { unit: 'week', interval: 1, hour: 9, minute: 0, weekdays: [3, 1] } }), t), '每周一、三 09:00')
  assert.equal(pureFns.cronScheduleText(mkTask({ schedule: { unit: 'month', interval: 1, hour: 9, minute: 0, monthDay: 15 } }), t), '每月 15 日 09:00')
})

test('调度摘要文案：英文词典同样可用', () => {
  const ten = (key) => en[key] ?? key
  assert.equal(pureFns.cronScheduleText(mkTask({ schedule: { unit: 'week', interval: 1, hour: 9, minute: 0, weekdays: [0, 6] } }), ten), 'Weekly on Sat, Sun at 09:00')
})

test('下次运行相对时间：过期/缺失返回 null，其余分档', () => {
  const now = Date.now()
  assert.equal(pureFns.cronFutureRelative(now - 1000, t), null)
  assert.equal(pureFns.cronFutureRelative(null, t), null)
  assert.equal(pureFns.cronFutureRelative(now + 20_000, t), '即将运行') // <30s 舍入为 0 分钟
  assert.equal(pureFns.cronFutureRelative(now + 5 * 60_000, t), '5 分钟后')
  assert.equal(pureFns.cronFutureRelative(now + 3 * 3_600_000, t), '3 小时后')
  assert.equal(pureFns.cronFutureRelative(now + 2 * 86_400_000, t), '2 天后')
})

// ---------------------------------------------------------------------------
// format 工具
// ---------------------------------------------------------------------------

test('format: 命中替换、缺失参数落空串', () => {
  assert.equal(pureFns.format('{n} 分钟', { n: 5 }), '5 分钟')
  assert.equal(pureFns.format('{a}-{b}', { a: 1 }), '1-')
})

// ---------------------------------------------------------------------------
// 项目模式入口锚定（placeToggleHost，logo 行对账）
// ---------------------------------------------------------------------------

/** 极简 DOM 桩：children 数组维护顺序，支持 insertBefore/appendChild 与兄弟/父子关系。 */
function mkNode(tag, attrs = {}) {
  return {
    tag,
    attrs,
    parentElement: null,
    children: [],
    getAttribute(name) { return this.attrs[name] ?? null },
    get lastElementChild() { return this.children[this.children.length - 1] ?? null },
    get nextElementSibling() {
      if (this.parentElement === null) return null
      const siblings = this.parentElement.children
      return siblings[siblings.indexOf(this) + 1] ?? null
    },
    get previousElementSibling() {
      if (this.parentElement === null) return null
      const siblings = this.parentElement.children
      return siblings[siblings.indexOf(this) - 1] ?? null
    },
    insertBefore(node, ref) {
      if (ref !== null && ref.parentElement !== this) throw new Error('ref 不在本节点下')
      if (node.parentElement !== null) {
        const old = node.parentElement.children
        old.splice(old.indexOf(node), 1)
      }
      const at = ref === null ? this.children.length : this.children.indexOf(ref)
      this.children.splice(at, 0, node)
      node.parentElement = this
    },
    appendChild(node) { this.insertBefore(node, null) },
  }
}

const tagsOf = (row) => row.children.map((n) => n.tag)

test('placeToggleHost: 首次挂载插到收起按钮之前（品牌之后）；重复对账不搬动', () => {
  const row = mkNode('logoRow'), brand = mkNode('brand'), toggle = mkNode('toggle')
  row.appendChild(brand); row.appendChild(toggle)
  const host = mkNode('host')
  pureFns.placeToggleHost(row, host)
  assert.deepEqual(tagsOf(row), ['brand', 'host', 'toggle'])
  pureFns.placeToggleHost(row, host) // 已在位：幂等
  assert.deepEqual(tagsOf(row), ['brand', 'host', 'toggle'])
})

test('placeToggleHost: 空行退化为 appendChild', () => {
  const row = mkNode('logoRow'), host = mkNode('host')
  pureFns.placeToggleHost(row, host)
  assert.deepEqual(tagsOf(row), ['host'])
})

test('placeToggleHost: 完整复现「收起→展开」——React 重挂品牌把入口顶到小鱼前面后，对账校回原位', () => {
  const row = mkNode('logoRow'), brand = mkNode('brand'), toggle = mkNode('toggle')
  const host = mkNode('host')
  row.appendChild(brand); row.appendChild(toggle)
  pureFns.placeToggleHost(row, host) // 初始展开态：[brand, host, toggle]
  // 收起（settle 后品牌被 React 移除）：[host, toggle]；观察器对账仍在位
  row.children.splice(0, 1); brand.parentElement = null
  pureFns.placeToggleHost(row, host)
  assert.deepEqual(tagsOf(row), ['host', 'toggle'])
  // 展开：React 只认自己的节点，insertBefore(brand, toggle) 把品牌插到外来容器之后
  row.insertBefore(brand, toggle)
  assert.deepEqual(tagsOf(row), ['host', 'brand', 'toggle'], '前置条件：未修复时入口被顶到品牌前')
  // 观察器对账：按锚点回位到收起按钮左侧
  pureFns.placeToggleHost(row, host)
  assert.deepEqual(tagsOf(row), ['brand', 'host', 'toggle'])
})

test('placeToggleHost: 入口被挤到收起按钮之后时也回到锚点', () => {
  const row = mkNode('logoRow'), brand = mkNode('brand'), toggle = mkNode('toggle')
  const host = mkNode('host')
  row.appendChild(brand); row.appendChild(toggle); row.appendChild(host)
  pureFns.placeToggleHost(row, host)
  assert.deepEqual(tagsOf(row), ['brand', 'host', 'toggle'])
})

// dsh Tooltip 的气泡 span（role=tooltip）会临时挂进 logo 行行尾：悬浮收起按钮
// 500ms 弹出、移开摘除。锚点若把它当「最后一个子元素」，入口会被搬过收起按钮
// ——按钮跳位、光标下错换成入口、气泡 mouseleave 被吞后卡死（v0.5.3 用户反馈）。
test('placeToggleHost: 收起按钮的 tooltip 气泡挂进行尾时不当锚点——入口原地不动', () => {
  const row = mkNode('logoRow'), brand = mkNode('brand'), toggle = mkNode('toggle')
  const host = mkNode('host'), bubble = mkNode('span', { role: 'tooltip' })
  row.appendChild(brand); row.appendChild(toggle)
  pureFns.placeToggleHost(row, host) // [brand, host, toggle]
  // 悬浮收起按钮 → dsh 气泡内联追加进行尾
  row.appendChild(bubble)
  pureFns.placeToggleHost(row, host)
  assert.deepEqual(tagsOf(row), ['brand', 'host', 'toggle', 'span'], '入口不得搬过收起按钮')
  // 移开 → 气泡摘除，回到常态
  row.children.splice(row.children.indexOf(bubble), 1); bubble.parentElement = null
  pureFns.placeToggleHost(row, host)
  assert.deepEqual(tagsOf(row), ['brand', 'host', 'toggle'])
})

test('placeToggleHost: 行尾有气泡时入口仍按收起按钮校位（跳过气泡找锚点）', () => {
  const row = mkNode('logoRow'), brand = mkNode('brand'), toggle = mkNode('toggle')
  const host = mkNode('host'), bubble = mkNode('span', { role: 'tooltip' })
  row.appendChild(brand); row.appendChild(host); row.appendChild(toggle); row.appendChild(bubble)
  pureFns.placeToggleHost(row, host) // 已在位：幂等，不被气泡带偏
  assert.deepEqual(tagsOf(row), ['brand', 'host', 'toggle', 'span'])
  // React 重挂把入口顶到品牌前，行尾还挂着气泡：仍要回到收起按钮之前
  row.children.splice(row.children.indexOf(host), 1); host.parentElement = null
  row.insertBefore(host, brand)
  pureFns.placeToggleHost(row, host)
  assert.deepEqual(tagsOf(row), ['brand', 'host', 'toggle', 'span'])
})

test('placeToggleHost: 行里只剩气泡等临时节点时空行退化为 appendChild', () => {
  const row = mkNode('logoRow'), bubble = mkNode('span', { role: 'tooltip' })
  const host = mkNode('host')
  row.appendChild(bubble)
  pureFns.placeToggleHost(row, host)
  assert.deepEqual(tagsOf(row), ['span', 'host'])
})

// ---------------------------------------------------------------------------
// 0.6 选区引用：guard / 上限与去重 / 引用块序列化 / 引用池 / sendSession 补丁
// ---------------------------------------------------------------------------

/** 提取 const 声明文本（到行尾分号），供纯函数闭包引用模块常量。 */
function extractConst(name) {
  const start = source.indexOf(`const ${name} =`)
  assert.ok(start >= 0, `源码中找到 const ${name}`)
  const end = source.indexOf(';', start)
  return source.slice(start, end + 1)
}

const quoteFns = new Function(`
  ${extractConst('QUOTE_LIMITS')}
  ${extractConst('QUOTE_FLOW_KINDS')}
  ${extractFn('quoteGuardCandidate')}
  ${extractFn('quoteDedupeKey')}
  ${extractFn('appendQuote')}
  ${extractFn('mergeQuoteLists')}
  ${extractFn('buildQuoteBlock')}
  ${extractFn('appendQuoteBlock')}
  ${extractFn('createQuoteStore')}
  ${extractFn('quoteSessionIdOf')}
  ${extractFn('quoteWrapSendSession')}
  ${extractFn('ensureQuoteSendPatch')}
  const QUOTE_PATCH_KEY = '__fiQuoteSendPatch';
  const quoteStore = createQuoteStore();
  return { QUOTE_LIMITS, QUOTE_FLOW_KINDS, quoteGuardCandidate, appendQuote, mergeQuoteLists, buildQuoteBlock, appendQuoteBlock,
    createQuoteStore, quoteSessionIdOf, ensureQuoteSendPatch, quoteStore };
`)()

const GUARD_OK = { enabled: true, sameFlow: true, insideTimeline: true, excluded: false, supportedKind: true, text: 'hi', hasLayout: true }

test('quoteGuardCandidate: 任一条件不满足即 ineligible；七项全过才 eligible', () => {
  assert.equal(quoteFns.quoteGuardCandidate(GUARD_OK), 'eligible')
  for (const key of ['enabled', 'sameFlow', 'insideTimeline', 'supportedKind', 'text', 'hasLayout']) {
    assert.equal(quoteFns.quoteGuardCandidate({ ...GUARD_OK, [key]: key === 'text' ? '' : false }), 'ineligible', key)
  }
  assert.equal(quoteFns.quoteGuardCandidate({ ...GUARD_OK, excluded: true }), 'ineligible')
})

test('quoteGuardCandidate: 超单条上限返回 single-limit（弹只读提示而非消失）', () => {
  assert.equal(quoteFns.quoteGuardCandidate({ ...GUARD_OK, text: 'a'.repeat(quoteFns.QUOTE_LIMITS.single + 1) }), 'single-limit')
  assert.equal(quoteFns.quoteGuardCandidate({ ...GUARD_OK, text: 'a'.repeat(quoteFns.QUOTE_LIMITS.single) }), 'eligible')
})

test('QUOTE_FLOW_KINDS: 助手流式回复（assistant-step/step）必须可引用——真实对话里 AI 回答都是它，漏掉 = 选字不弹菜单', () => {
  assert.equal(quoteFns.QUOTE_FLOW_KINDS['assistant-step'], 'assistant')
  assert.equal(quoteFns.QUOTE_FLOW_KINDS.step, 'assistant')
  assert.equal(quoteFns.QUOTE_FLOW_KINDS.assistant, 'assistant')
  assert.equal(quoteFns.QUOTE_FLOW_KINDS.user, 'user')
  assert.equal(quoteFns.QUOTE_FLOW_KINDS.steering, 'user')
  assert.equal(quoteFns.QUOTE_FLOW_KINDS['tool-call'], 'tool')
  assert.equal(quoteFns.QUOTE_FLOW_KINDS['tool-result'], 'tool')
  // 系统性节点不可引用
  for (const kind of ['turn-process', 'turn-error', 'compaction', 'context', 'command', 'unknown-surface']) {
    assert.equal(quoteFns.QUOTE_FLOW_KINDS[kind], undefined, kind)
  }
})

const mkQuote = (text, kind = 'user', id = text) => ({ id, text, kind, sourceLabel: `引用 · ${kind}` })

test('appendQuote: 去重（同类型同文本）；条数/总长上限；保持添加顺序', () => {
  const first = quoteFns.appendQuote([], mkQuote('a'))
  assert.equal(first.ok, true)
  assert.equal(first.duplicate, false)
  // 重复添加按成功处理，列表不变
  const dup = quoteFns.appendQuote(first.quotes, mkQuote('a'))
  assert.equal(dup.ok, true)
  assert.equal(dup.duplicate, true)
  assert.equal(dup.quotes.length, 1)
  // 同文本不同类型不去重
  assert.equal(quoteFns.appendQuote(first.quotes, mkQuote('a', 'assistant')).quotes.length, 2)
  // 条数上限
  let quotes = []
  for (let i = 0; i < quoteFns.QUOTE_LIMITS.count; i++) quotes = quoteFns.appendQuote(quotes, mkQuote(`q${i}`)).quotes
  const over = quoteFns.appendQuote(quotes, mkQuote('overflow'))
  assert.equal(over.ok, false)
  assert.equal(over.reason, 'count')
  // 总长上限（三条各 5000 共 15000，再放 2000 超过 16000；放 100 还装得下）
  const base = [mkQuote('x'.repeat(5000)), mkQuote('y'.repeat(5000)), mkQuote('w'.repeat(5000))]
  assert.equal(quoteFns.appendQuote(base, mkQuote('z'.repeat(2000))).reason, 'total')
  assert.equal(quoteFns.appendQuote(base, mkQuote('short')).ok, true)
  // 单条超限在入口即拒
  assert.equal(quoteFns.appendQuote([], mkQuote('a'.repeat(quoteFns.QUOTE_LIMITS.single + 1))).reason, 'single')
})

test('mergeQuoteLists: 回滚合并去重并按同一套上限收口', () => {
  const merged = quoteFns.mergeQuoteLists([mkQuote('a'), mkQuote('b')], [mkQuote('a'), mkQuote('c')])
  assert.deepEqual(merged.map((q) => q.text), ['a', 'b', 'c'])
  const capped = quoteFns.mergeQuoteLists([], Array.from({ length: 12 }, (_, i) => mkQuote(`q${i}`)))
  assert.equal(capped.length, quoteFns.QUOTE_LIMITS.count)
})

test('buildQuoteBlock: 引用块带来源头、逐行前缀、空行占位、多条空行分隔', () => {
  assert.equal(
    quoteFns.buildQuoteBlock([mkQuote('第一行\n\n第二行', 'assistant')]),
    '> 【引用 · assistant】\n> 第一行\n>\n> 第二行',
  )
  assert.equal(
    quoteFns.buildQuoteBlock([mkQuote('a', 'user'), mkQuote('b', 'tool')]),
    '> 【引用 · user】\n> a\n\n> 【引用 · tool】\n> b',
  )
})

test('appendQuoteBlock: 空正文只出引用块；有正文空行衔接；无引用原样返回', () => {
  assert.equal(quoteFns.appendQuoteBlock('', [mkQuote('a')]), '> 【引用 · user】\n> a')
  assert.equal(quoteFns.appendQuoteBlock('看看', [mkQuote('a')]), '看看\n\n> 【引用 · user】\n> a')
  assert.equal(quoteFns.appendQuoteBlock('正文', []), '正文')
  assert.equal(quoteFns.appendQuoteBlock(undefined, []), '')
})

test('createQuoteStore: add/remove/clear/take/restore 与失败提示 note', () => {
  const store = quoteFns.createQuoteStore()
  assert.deepEqual(store.record('s1'), { quotes: [], note: null })
  store.add('s1', mkQuote('a'))
  store.add('s1', mkQuote('b', 'assistant'))
  assert.equal(store.record('s1').quotes.length, 2)
  store.remove('s1', 'a')
  assert.deepEqual(store.record('s1').quotes.map((q) => q.text), ['b'])
  // 上限失败：列表不动、note 记原因；下次成功添加消掉 note
  const full = []
  for (let i = 0; i < quoteFns.QUOTE_LIMITS.count; i++) full.push(mkQuote(`q${i}`))
  for (const q of full) store.add('s1', q)
  assert.equal(store.record('s1').note, 'count')
  store.remove('s1', 'q0')
  const readd = store.add('s1', mkQuote('re'))
  assert.equal(readd.ok, true)
  assert.equal(store.record('s1').note, null)
  // take：发送即消费；restore：失败回滚
  const taken = store.take('s1')
  assert.ok(taken.length > 0)
  assert.deepEqual(store.record('s1'), { quotes: [], note: null })
  store.restore('s1', taken)
  assert.equal(store.record('s1').quotes.length, taken.length)
  // clear
  store.clear('s1')
  assert.deepEqual(store.record('s1'), { quotes: [], note: null })
})

test('quoteSessionIdOf: session 快照带 id 优先；拿不到回退当前会话；全无则 null', () => {
  const sessions = { list: { getSnapshot: () => ({ current: 'cur' }) } }
  assert.equal(quoteFns.quoteSessionIdOf({ getSnapshot: () => ({ id: 's9' }) }, sessions), 's9')
  assert.equal(quoteFns.quoteSessionIdOf({}, sessions), 'cur')
  assert.equal(quoteFns.quoteSessionIdOf(null, { list: { getSnapshot: () => ({}) } }), null)
})

test('ensureQuoteSendPatch: 服务不可达返回 false 不抛异常（dsh 改版时功能隐藏）', () => {
  const sessions = { list: { getSnapshot: () => ({ current: 's1' }) }, scope: () => undefined }
  assert.equal(quoteFns.ensureQuoteSendPatch({ get: () => undefined }, sessions), false)
  assert.equal(quoteFns.ensureQuoteSendPatch({ get: () => { throw new Error('no service') } }, sessions), false)
  assert.equal(quoteFns.ensureQuoteSendPatch({ get: () => ({ sendSession: 'not a fn' }) }, sessions), false)
})

test('ensureQuoteSendPatch: 包裹 sendSession——引用拼块后发送、发送即消费、幂等不重复包裹', async () => {
  const store = quoteFns.quoteStore
  store.clear('s1')
  const originals = []
  const service = { sendSession: async (session, text) => { originals.push(text); return { ok: true, text } } }
  const ctx = { get: () => service }
  const sessions = { list: { getSnapshot: () => ({ current: 's1' }) } }
  assert.equal(quoteFns.ensureQuoteSendPatch(ctx, sessions), true)
  assert.equal(quoteFns.ensureQuoteSendPatch(ctx, sessions), true) // 幂等
  store.add('s1', mkQuote('被选中的话', 'assistant'))
  const outcome = await service.sendSession({ getSnapshot: () => ({ id: 's1' }) }, '看看这段')
  assert.equal(originals.length, 1)
  assert.equal(originals[0], '看看这段\n\n> 【引用 · assistant】\n> 被选中的话')
  assert.equal(outcome.text, originals[0])
  assert.deepEqual(store.record('s1').quotes, [], '发送即消费，chip 消失')
  // 无引用时原样透传
  await service.sendSession({ getSnapshot: () => ({ id: 's1' }) }, '第二条')
  assert.equal(originals[1], '第二条')
  // 再次 ensure 仍是同一个包裹（originals 每次恰好一条）
  quoteFns.ensureQuoteSendPatch(ctx, sessions)
  await service.sendSession({ getSnapshot: () => ({ id: 's1' }) }, '第三条')
  assert.equal(originals.length, 3)
})

test('ensureQuoteSendPatch: 发送失败时引用随草稿回滚（chip 回来）', async () => {
  const store = quoteFns.quoteStore
  store.clear('s2')
  const service = { sendSession: async () => { throw new Error('no credentials') } }
  quoteFns.ensureQuoteSendPatch({ get: () => service }, { list: { getSnapshot: () => ({ current: 's2' }) } })
  store.add('s2', mkQuote('要保持的引用', 'user'))
  await assert.rejects(service.sendSession({ getSnapshot: () => ({ id: 's2' }) }, '发送'))
  await new Promise((r) => setTimeout(r, 0)) // 等 wrapper 的 catch 微任务跑完
  assert.deepEqual(store.record('s2').quotes.map((q) => q.text), ['要保持的引用'])
  store.clear('s2')
})

test('apply(): 注册 conversation.input.dock 引用 chip 槽位（list 型、id fi-quotes）', () => {
  const reg = captured.registrations.find((r) => r.options.name === 'conversation.input.dock')
  assert.ok(reg, '找到 conversation.input.dock 注册')
  assert.equal(reg.options.id, 'fi-quotes')
  assert.equal(reg.options.order, 10)
  assert.equal(typeof reg.component, 'function')
  assert.ok(captured.slotNames.includes('conversation.input.dock'))
})

test('quote.kind.* 四类来源与 source/limit 词条在两份词典中齐全', () => {
  for (const kind of ['user', 'assistant', 'reasoning', 'tool']) {
    assert.ok(`quote.kind.${kind}` in zh, `zh 缺 quote.kind.${kind}`)
    assert.ok(`quote.kind.${kind}` in en, `en 缺 quote.kind.${kind}`)
  }
  for (const key of ['quote.addToTask', 'quote.tooLong', 'quote.count', 'quote.remove', 'quote.clear', 'quote.source', 'quote.limit.count', 'quote.limit.total']) {
    assert.ok(key in zh && key in en, `词典缺 ${key}`)
  }
})
