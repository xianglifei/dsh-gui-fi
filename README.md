# fi

基于 [dsh](https://github.com/deepseek-ai/deepseek-harness)（DeepSeek Harness）内置 Web 界面的 Electron 桌面套壳。目标：先用最小契约把 `dsh --profile web` 完整装进原生窗口，后续在这个壳上持续二开。

## 功能一览

**桌面壳**

- 原生窗口承载 dsh Web 界面，使用独立 profile（`~/.dsh/profiles/fi`）：与浏览器版互不干扰，会话历史/设置/API 凭据共享
- dsh 子进程自动托管：随机端口启动、崩溃自动重启、退出干净回收、单实例
- 桌面化细节：外部链接走系统浏览器、流式输出中关窗确认、窗口标题品牌「fi」
- macOS Finder 右键「服务 → 在 fi 中打开」：任意文件夹直达 fi，自动登记（或复用）该项目工作区并开始新任务

**任务与项目**

- 侧栏四入口：新建任务 / 搜索（⌘K）/ 定时任务 / 插件中心
- 普通模式任务清单按最近更新排序；项目任务可一键展开，按文件夹分组查看（开关状态跨重启记忆）
- 项目模式：Finder 式文件浏览器（路径条跳转、右键复制路径/在 Finder 中显示、隐藏项显隐）；在任意文件夹里一键新建任务，会话自动归属该项目
- ⌘K 搜索：任务标题 + 消息内容全文检索（覆盖全部工作区，含项目文件夹里的会话），回车直达

**自动化与扩展**

- 定时任务：每 N 分钟 / 每天 / 每周 / 每月四种节奏，可指定默认工作区或项目文件夹、次数上限，四档进度筛选，支持立即运行、暂停/恢复、编辑、删除
- 插件中心：管理 fi 专属插件（一键安装/卸载，两步确认防误触），内置精选推荐位

**对话增强**

- 选区引用：选中任意消息里的文字（用户消息/助手回复/思考过程/工具输出）即可挂为引用，发送时自动并入提示词，输入框保持干净

## 安装

fi 目前以源码方式安装（打包 dmg 见路线图）。前置要求：

- macOS（主要开发与测试平台，Windows/Linux 未充分测试）
- [Node.js](https://nodejs.org/)（≥ 20）与 [pnpm](https://pnpm.io/)
- dsh CLI：`npm install -g @deepseek-ai/dsh`

```bash
git clone https://github.com/xianglifei/dsh-gui-fi.git
cd dsh-gui-fi
pnpm install
pnpm start      # 构建并启动
```

首次启动会自动初始化 fi 专属 profile 并打开窗口，认证 cookie 存在独立的 `persist:fi` 分区里，不影响浏览器里的登录。此前用过 dsh（浏览器版或 CLI）的话，登录与 API 凭据直接沿用；第一次接触 dsh 的话，在 fi 的「设置」页配置 DeepSeek API Key 后即可开始使用。

开发者用 `pnpm dev`（tsup watch + Electron）。环境变量（都是可选）：

- `FI_DSH_BIN` — 指定 dsh 可执行文件路径（默认按 PATH → homebrew → /usr/local 顺序找）
- `FI_DSH_URL` — 不 spawn，直接连接一个已在运行的 `dsh --profile web`（值带上 `?token=...`）
- `FI_FINDER_TRACE` — 打开 Finder「在 fi 中打开」链路的逐跳日志（接收→校验→确认→投递→回执）

版本历史见 [CHANGELOG.md](CHANGELOG.md)；发版规则见 [AGENTS.md](AGENTS.md)。

## 工作原理

只依赖 dsh 的一条最小契约：**spawn → stdout 里的登录 URL → loadURL**。

```
Electron main
 ├─ 首次: dsh --profile fi --from-default-profile web   (从内置模板初始化专属 profile)
 ├─ 之后: dsh --profile fi --port 0 --no-open            (headless, 随机端口)
 ├─ 解析 stdout: "dsh web: http://127.0.0.1:<port>/?token=..."
 ├─ BrowserWindow.loadURL(url)  ← 首次加载 token 换 30 天 HttpOnly cookie
 └─ 生命周期: 崩溃重启(指数退避) / 退出 SIGTERM→SIGKILL 回收 / 单实例
```

**独立 profile**：fi 用自己的 `~/.dsh/profiles/fi`（内置 web 模板初始化，只有 `dsh-base + dsh-web-app` 两个基础 bundle），你在浏览器版 `dsh web` profile 里装的插件（如 peak-hours、whale-widget）不会进 fi；反过来想给 fi 单独装插件，执行 `dsh plugin --profile fi add <package>`。会话历史、设置、API 凭据在 `~/.dsh` 家目录层共享，不受 profile 影响。

**窗口标题品牌**：dsh 页面把 `document.title` 设为「DeepSeek Harness」（任务态「任务标题 - DeepSeek Harness」），Electron 默认将其镜像为原生窗口标题；主进程在 `page-title-updated` 拦截改写（`src/main/window.ts`），标题栏显示「fi」/「任务标题 - fi」（同源预览弹窗同样处理），不含品牌字样的标题原样放行。仅影响标题栏，页面内与浏览器直开 dsh 的行为不变。

**侧栏改版插件（`dsh-plugin/`）**：fi 的侧栏 UI（新建任务/搜索/定时任务/插件中心按钮列 + 项目模式入口）由随应用携带的 dsh 插件 `fi-sidebar` 实现，启动时自动 `dsh plugin --profile fi add link:` 进 profile（幂等；失败则退回 dsh 原生侧栏）。实现要点：

- 服务端半层启动时确保隐藏的 **default 工作区** 存在（`~/.dsh/workspace-default`，展示标题 `default`）。「新建任务」固定在这个工作区里新建会话；侧栏默认列表（普通模式）默认只展示它的会话（项目任务可用「任务」分隔栏右侧的开关展开，见下方「项目任务显隐」）（单列表、按最近更新倒序，可见性规则与 dsh 一致：排除子代理/已归档行，blank 行只保留当前那条）。用户不需要感知工作区概念。冷启动的初始会话同样钉在这里：dsh 原生逻辑会选「最近活动」的工作区（可能是近期用过的项目文件夹），客户端半层在启动快照就绪时单次改钉 default（default 晚到则等它出现再钉；用户已停在真实会话上时不打扰），ensure 失败时退化为 dsh 原生行为。
- 客户端半层是手写的 dsh 客户端模块（`lib/client.js`，无构建步骤），以 `priority: -1` 影子接管 `sidebar.workspaces` 槽位（single 槽位取 priority 最低的注册者），并复用宿主的 `uiWorkspace` 服务（`startSession(workspaceId)` / `openSession(id)`）与 `useSessions` / `useWorkspaces` 等全局 hook；旧「新会话」按钮用 CSS 隐藏（选择器只匹配类名尾段 `_newSession`，容忍哈希变化）。
- 图标：fi 自有 UI（按钮列、项目模式入口、文件浏览器、右键菜单、搜索弹窗）全量使用内联的 Lucide 线稿——官方 path 数据进 `LUCIDE_INNER` 表（ISC 协议，无运行时依赖），`icon()` 优先查该表、未命中回落 dsh primitives；与 dsh 自身界面的 fill 风格图标刻意区分。
- 项目模式入口：logo 行没有对外 slot，客户端往 dsh 原生 logo 行注入容器节点，经 React portal 渲染文件夹图标按钮（收起按钮左侧，收起态隐藏；MutationObserver 对账——被 React 重渲染挤掉时插回，展开时被重挂的品牌按钮顶离锚点则搬回原位）。点击进入项目模式（图标切换为打开状态），logo 行以下整体切换为 Finder 式文件浏览器，再点恢复普通模式。
- 品牌文字标移除：logo 行的「deepseek HARNESS」文字经官方 `sidebar.brand.name` single 槽位注册空渲染整体接管（小鱼图标 `sidebar.brand.mark` 与收起按钮不受影响），行内只剩小鱼图标、项目模式入口、收起按钮三个元素。
- 项目文件浏览器：逐层进入（非树形展开），层级栈既是导航状态也是路径条（点面包屑跳转、返回上一级、手动刷新）。数据走 fi 自带的只读 Electron 文件桥（preload `window.fi.fs` → 主进程 `fs.promises.readdir(withFileTypes)`：符号链接按目标归类、断链灰显不可点，目录优先 + 自然排序，单层上限 1000 条并报 truncated）。单击文件用系统默认程序打开；右键菜单（复制路径 / 在 Finder 中显示 / 打开）走 `shell.*` 与剪贴板 IPC。浏览位置记在客户端模块级变量里：本次运行内退出项目模式再进入保持原地，重启复位。隐藏项（点前缀条目）名字与图标置灰；路径条上的眼睛按钮切换隐藏项显隐（睁眼=显示、闭眼=隐藏），默认不展示，选择持久在 localStorage（`fi.sidebar.showHidden`，跨重启，与只记本次运行的位置记忆不同）。浏览器直接打开 dsh 网页时无文件桥，项目模式显示提示行。
- 「在文件夹里新建任务」（文件夹行尾的气泡加号图标，Lucide `message-circle-plus`，对齐 ZCode 的新建任务图标；项目模式的核心）：客户端 `workspaces.create({ path })`（dsh `workspaceController` 远程，幂等，同一目录复用同一条工作区登记并立即合入客户端投影），随后 `uiWorkspace.startSession(workspaceId)`——复用该工作区里未发送过消息的 blank 会话，否则新建并在右侧打开。会话按 cwd 自动归入对应项目工作区，不进普通模式的 default 任务清单（可用下方开关在普通模式展开查看）。右键复制路径成功不做提示（对齐系统惯例），失败提示仅保留给打开/新建动作。
- **项目任务显隐**：普通模式「任务」分隔栏右侧的开关（Lucide `folder-dot`=收起/默认、`folder-open-dot`=展开）切换项目任务的显示：展开后 default 行照旧在顶部，其下按项目工作区分组追加——组头带文件夹图标与工作区名（文件夹名），组内按最近更新倒序、组间按组内最新活动倒序（最近用过的项目排上面），没有可见会话的工作区整组不出现；点击组内任务行即打开该会话。可见性规则与普通任务同一套（排除子代理/已归档，blank 只留当前——在文件夹里刚建、还没发首条消息的任务切回普通模式也能看到）。选择持久在 localStorage（`fi.sidebar.showProjectTasks`，跨重启），默认收起；展开但没有任何项目任务时列表尾部给一行提示。
- 「搜索」：点击按钮或按 ⌘K（Windows/Linux 为 Ctrl+K）唤起居中搜索弹窗（ZCode Command Center 的会话版：全屏模糊遮罩 + 顶部圆角面板，portal 到 body）。空查询列最近任务；输入后 250ms 防抖本地标题/工作区名匹配 + dsh 内建消息内容搜索（cordis `sessions` 服务，SQLite FTS，上限 20 条，`hasMore` 提示细化关键词）合并展示，↑/↓ 循环选择、Enter 打开、Esc/点遮罩关闭，标题命中加亮；搜索覆盖全部工作区（含项目模式文件夹），default 工作区的行不重复展示工作区名。「插件中心」见下方专条。普通/项目模式的选择记在 localStorage（`fi.sidebar.mode`）。
- 会话全文搜索索引：dsh 出厂 web 模板把 `session-query-sqlite` 配成 `openAt: never`（搜索 opt-in），fi 在插件补丁（`dsh-plugin/cordis.patch.yml`）里按同 id 覆盖为 `openAt: startup` + 落盘 `~/.dsh/session-query.db`，内容搜索才可用；后端不可用时弹窗自动降级为仅标题匹配并提示。
- **定时任务**（侧栏「定时任务」按钮）：右侧整页面板（portal 到 body，左缘经 ResizeObserver 实时跟随侧栏宽度；点击新建任务/插件中心或任何会话被打开即退出面板）。调度与状态在主进程（`src/main/cron.ts`）：任务定义落盘 `~/.dsh/profiles/fi/fi-cron-tasks.json`（≤20 个，原子写），30s 轮询扫描到期任务；重复节奏用结构化规则（unit+interval+锚点，不用 cron 表达式），日/周/月锚定创建时刻的日历窗口。派发走 dsh web 官方远程端点（握手 URL 换 cookie 后 POST `/api/...`）：`workspace/create`（按 canonical path 幂等）→ `session/create({workspaceId})`（会话即时计入工作区清单）→ `session/prompt`（accepted 即派发成功）。生命周期：active/paused/completed/failed——completed 是有限计划自然耗尽的终态不可复活，failed 仅表示派发失败可重新启用，循环任务某轮失败只留错误痕迹继续调度；四档进度筛选（全部/进行中/已完成/失败）与卡片状态徽章共用同一对判定函数。客户端经 preload `window.fi.cron` 调用，主进程每次落库后向窗口推全量。运行会话按执行位置归组：「默认工作区」进普通模式任务清单，「项目文件夹」归该项目工作区（与项目模式新建任务的归属一致）。
- **插件中心**（侧栏「插件中心」按钮）：右侧整页面板（与定时任务面板互斥，Esc 或打开任何会话退出），上下两区。上区「已安装」＝ fi 专属 profile（`~/.dsh/profiles/fi/package.json`）的依赖清单（主进程 `src/main/plugin-center.ts` 读取，名称/版本/介绍取自插件自身的 package.json，仓库地址归一化为 https 直链）——这是「在 fi 里安装」的边界，浏览器 web profile 或其他客户端装的插件不进来；内置 fi-sidebar 随壳自动 link、非用户安装，过滤不展示；空表时只显示一句安装指引。每行行尾提供卸载按钮（两步确认，3s 不确认自动复位；主进程转发 `dsh plugin --profile fi remove <name>`——已实证该命令同时清理依赖表与 bundles 列表；内置 fi-sidebar 在主进程侧即被拒绝，防止误拆 fi 自己的侧栏）。下区「推荐」＝随 fi 发版的静态精选表（`RECOMMENDED_PLUGINS`，收录 dsh-whale-widget 与 dsh-fx-review——后者把右侧栏 Markdown 预览接管为 CriticMarkup 批注审阅，批注全文一键复制交回模型修改），推荐位常驻不因已安装消失：未安装给「安装」按钮（主进程转发 `dsh plugin --profile fi add <spec>`，与启动时插件 link 同一条命令面；spec 统一为 GitHub 直装 `github:<owner>/<repo>` 形式——包在仓库子目录时带 `#path:<dir>`，pnpm 从默认分支拉取，不经 npm registry），已安装按包名匹配换成「已安装」徽章，卸载后自动变回安装按钮；安装/卸载成功经 `fi:plugins:changed` 推全量刷新，并提示重启 fi 生效（运行中的 dsh 不热加载/卸载 bundle，不自动重启以免打断会话）。客户端经 preload `window.fi.plugins` 调用；浏览器直开 dsh 网页时面板退化为仅桌面版提示。
- **选区引用**（对话区选中文字 →「添加到当前任务」）：在对话消息（用户/助手/思考/工具输出，`data-chat-flow-kind` 判型）内选中一段文字弹出悬浮菜单，点击后引用 chip 挂到官方 `conversation.input.dock` 槽位（输入框正上方，与 todo/queue dock 同列），展开可逐条预览/移除/清空（对齐 ZCode 的 Conversation Selection：单条 8000 字、8 条、总量 16000 字上限与去重）。发送合并不拦截 UI：composer 的唯一发送出口是 `ConversationController.sendSession`（InputHub 每次动态解析服务实例），在实例上包一层把引用拼成 markdown 引用块（`> 【引用 · 来源】` 前缀行 + 逐行引用）追加到正文尾，历史以原生 blockquote 样式可见；发送失败时引用随草稿回滚回 chip。探测不到该出口（dsh 改版）时整个功能静默隐藏。

- **Finder「在 fi 中打开」**（`src/main/finder-open.ts`）：fi 启动时把一个 Automator「快速操作」程序化写进 `~/Library/Services/Open in fi.workflow`（Info.plist 声明 NSServices：只在 Finder 里、只对文件夹右键出现；内容幂等，变更时才刷新系统服务索引）。工作流本体是一个 Run Shell Script：取第一个目录参数做 URL 编码，然后拉起 fi 并把 `fi://workspace/open?path=…` 传给它。拉起方式随安装形态：**源码安装**下 LaunchServices 没有可认领 `fi://` 的 app bundle（裸 Electron 注册不了协议），脚本把 Electron 二进制与仓库绝对路径烘焙进去后台直启——fi 在跑时新进程经单实例锁把 URL 转交常驻实例（second-instance），没在跑时 URL 作为启动参数冷启动；**打包后**改走 `/usr/bin/open` 系统协议（app 的 Info.plist 声明 CFBundleURLTypes 认领）。URL 统一由主进程接收：校验路径（绝对路径/存在/是目录，先于任何文件系统探测拒绝网络路径）→ 弹系统确认对话框（取消为默认，防任意来源深链驱使 fi 打开目录）→ 投递给 fi-sidebar 客户端，复用项目模式同一动作（`workspaces.create` + `uiWorkspace.startSession`）在该文件夹工作区开始新任务。对话框有两个时序约束：必须推迟到 second-instance 原生回调之外执行（回调内同步弹框主进程会被系统 SIGKILL），且要等主窗口可见后才弹（冷启动时窗口尚未显示，挂在隐藏窗口上的模态框不可见却阻塞整个启动）。投递带回执重试：客户端动作成功才确认，10 秒未确认自动重投（最多 3 次——dsh 的会话创建偶发静默挂起，重投靠 blank 会话复用收敛）。链路观测用 `FI_FINDER_TRACE=1`。隔离实例（`FI_USER_DATA_DIR`）不装服务，避免冒烟测试污染系统全局状态。

**外链**：window.open 和主框架跳转里的外部 http(s) 一律走系统浏览器；dsh 同源弹窗（如附件预览）开小窗口共享会话。
- **流式中关窗确认**：preload 监听页面上停止按钮的 aria-label（“停止生成”/“Stop generating”，来自 dsh-client-ui-conversation 的 `input.stop`），流式期间关窗/退出会弹确认。dsh 改版或换语言导致标记失配时静默降级为直接关。
- **dsh 进程被外部杀掉**：窗口切到内建状态页，自动重启后无缝恢复界面。

## 路线图（二开层次，由浅入深）

1. **壳层原生**（当前）：托盘/菜单栏常驻、dock 徽标、通知、自动更新、打包 dmg（electron-builder）
2. **页面注入**（已启用）：侧栏改版走「dsh 插件 + 客户端模块」的正装路线（slot priority 影子替换、宿主服务复用）；fi preload 目前只做流式忙碌检测，后续 DOM 增强与快捷指令优先考虑插件层
3. **协议层**：壳直连 `/api/remote.mux`（会话事件、审批流），做壳自己的原生 UI
4. **kernel 层**：长期方向——像 fx-tui 一样以 Cordis bundle 挂进 dsh 内核（fx-gui-host），GUI 与 TUI 共享同一内核

参考：dsh 官方已保留 `desktop` profile 名给未来的 Electron 应用（其预设架构是 file:// 加载 dist + IPC 桥）；fi 目前刻意不复制那条重路线，HTTP 表面契约更小、升级更稳。

## 已知限制

- Finder 服务随 fi 每次启动安装/重写（自愈式）：源码安装形态下服务脚本烘焙了 Electron 二进制与仓库的绝对路径（`process.execPath` 经 pnpm 符号链接解析为 `.pnpm` 物理路径，随 Electron 版本变化），仓库挪动或重装依赖后需重启一次 fi 才恢复。网页 `fi://` 深链需打包后（协议进 app 的 Info.plist）才可用，源码安装形态未注册系统协议。卸载 fi 不会自动清理：服务项手动删除 `~/Library/Services/Open in fi.workflow` 即可；深链确认对话框每次都会弹（外部输入 gate，属有意设计）。Windows/Linux 右键菜单暂未做（fi 主平台为 macOS）
- dsh 的握手只有 stdout 里一行 URL，无 `--print-url` 之类的机器接口；dsh 升级若改这行格式需要同步 `URL_LINE_RE`（src/main/dsh-process.ts）
- dev 模式下 macOS 菜单栏应用名显示为 "Electron"（来自 dev bundle 的 Info.plist），打包后即为 fi
- 忙碌检测只认中文/英文停止按钮文案，其他界面语言降级为不拦截关窗
- 侧栏插件依赖 dsh 的 slot/hook 面（`sidebar.workspaces` 槽位、`uiWorkspace` 服务、根 hooks）：dsh 大版本改动这些内部契约时，插件会静默失效并退回原生侧栏；旧「新会话」按钮的隐藏选择器匹配 CSS Modules 类名尾段，同样有随版本失效的可能
- 选区引用的发送合并依赖 dsh `ConversationController.sendSession`（客户端模块在服务实例上包裹实现）；该出口属 dsh 内部结构，改版时功能整体静默隐藏（菜单不出现）。引用不跨重启持久；空正文 + 仅引用的发送暂不支持（dsh 发送按钮对空草稿置灰，属宿主行为）
- 首次启动（或插件未装时）会多跑一步 profile 初始化 + 插件 link，启动略慢属正常
- 普通模式会话的输入框下方会显示 default 工作区名（来自 dsh 原生 composer 的工作区选择器），本期未处理
- 定时任务只在 fi 运行期间调度（与 dsh 同生命周期）：fi 未运行时不触发，错过的时间点在下次启动时静默顺延，不补跑；运行中的会话若遇 dsh 重启会随之中断（任务状态不受影响）
- 定时任务派发依赖 dsh web 的 `/api` 远程端点（`workspace/create` / `session/create` / `session/prompt`）与握手 token→cookie 认证，属 dsh 内部 HTTP 契约，dsh 大版本改动时需要同步 cron.ts（任务状态语义参考 ZCode Automations 设计）
- 插件中心的推荐清单是随 fi 发版的内置静态表（版本号为收录时快照，GitHub 直装实际拉取默认分支、可能比快照新），不联网更新；收录/升版靠改 `RECOMMENDED_PLUGINS` 表随版本发布。安装与卸载都需重启 fi 才会被运行中的 dsh 加载/卸掉（操作不自动重启）。「已安装」判定只认 fi profile 的依赖表，用别的方式（如手动改 profile）装入的插件能否展示取决于依赖表是否记录。
