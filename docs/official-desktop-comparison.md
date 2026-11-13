# fi 与 dsh 官方 Desktop 的对比

> 调研基线：官方 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) master（dsh 0.2.1-rc.2，2026-10-19），
> 对照 fi v1.0.x。官方代码位于本仓库 `References/deepseek-harness`（本地参考检出，不入库）：
> `apps/desktop`（Electron 壳）与 `apps/desktop-host`（私有 host 进程）。本文是定位与架构的参照系，
> 具体行为以双方 README 为准。

## TL;DR

官方桌面版与 fi 的**基本定位相同**：Electron 壳包 dsh Web 应用、独立 profile、本机回环随机端口、
token→cookie 握手、靠 slot/插件体系定制 UI。fi 的关键架构决策被官方用同样的方式做了一遍。

**根本差异只有一条**：官方是 monorepo 内的一等公民——整个 dsh 运行时打进 app、版本与 dsh 锁死
（升 dsh 必发新 Desktop）、不依赖用户机器上的 Node/dsh/pnpm；fi 是**外挂壳**——spawn 用户装的 dsh、
靠最小契约（stdout URL + `/api` 表面）存活，换来独立升级与快速迭代。其余差异基本都是这条的派生。

## 一、相同之处（官方对 fi 路线的背书）

1. **壳与 Web 的边界同一条线**：官方自述「桌面应用是完整 dsh Web 应用外的一层 Electron 壳」，不重写 UI。
2. **独立 profile + web 模板**：官方保留名 `~/.dsh/profiles/desktop`，用 `PROFILE_TEMPLATES.web` 初始化，
   bundles 正是 `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']`（`packages/boot/app-boot/src/profile.ts`）
   ——与 fi 的 `profiles/fi` + `--from-default-profile web` 一字不差；会话/设置/凭据同样留在家目录层共享。
3. **回环 + 随机端口 + token→cookie**：官方 host 以 `--host 127.0.0.1 --port 0 --no-open` 起 dsh，
   认证即 fi 在用的 `?token=` → 303 → 签名 cookie（`packages/client/connection/src/browser-auth.ts`）。
4. **UI 定制走同一套客户端插件/slot 体系**：官方桌面没有任何「桌面专属客户端插件」——桌面能力随 web
   bundle 发布，运行时探测 `window.dshDesktop` / `<html data-platform>` 决定走桌面分支还是浏览器分支。
   这验证了 fi-sidebar 插件改侧栏是「正装路线」：官方自己改 UI 也走这条路，只是它拥有 web bundle 随包发，
   fi 是外挂运行时装进 profile。
5. **安全基线一致**：`contextIsolation: true + nodeIntegration: false + sandbox: true`，外链走系统浏览器。
6. 单实例锁、崩溃恢复、自定义协议等壳层标配双方都有。

## 二、核心差异

| 维度 | 官方 Desktop | fi |
|---|---|---|
| dsh 来源 | 内置运行时树（sha256 清单、asar 外），**版本与 dsh 精确锁死** | 用户 PATH 上的 dsh，fi 与 dsh 各自升版 |
| Node 依赖 | 零依赖：Electron 以 `ELECTRON_RUN_AS_NODE` + `--expose-internals` 跑 host，内置 pnpm | 不要求系统 Node（fi 以 Electron-as-Node 执行 dsh 脚本）；插件安装仍走 dsh 自带的包管理器 |
| 就绪发现 | 结构化 Node IPC `ready` 事件（协议带版本号），fatal 附诊断 | 解析 stdout 的 `dsh web: http://…` 正则（官方 CLI 同样打印该行，事实稳定） |
| 页面加载 | 自定义 `dsh-app://` scheme + 主进程反向代理，cookie 不进渲染进程 cookie jar | 直接 `loadURL(http://127.0.0.1:port/?token=…)`，cookie 在 `persist:fi` 分区 |
| 关窗行为 | 关窗＝隐藏，页面与 host 继续跑（Windows 配托盘找回） | 同（macOS 关窗＝隐藏保活；Dock 图标/二次启动/深链找回） |
| 忙碌判定 | 结构化 quit-inspection IPC：查运行中 agent/排队消息/后台任务/定时提醒，2 秒超时按有任务处理 | `session/list` API 的 `running` 字段（同口径：超时保守、覆盖全部工作区），DOM 停止按钮嗅探降级 |
| 崩溃恢复 | 崩溃报告 + 恢复对话框 + 「禁用第三方插件」安全模式（sanitizeProfile 重置回 web 模板） | 崩溃指数退避重启；连续 3 次异常退出提供「禁用第三方插件并重试」安全模式（逐插件 `dsh plugin remove`） |
| 产品工程 | electron-updater + 更新准入锁（API 网关 503 排空）、Mac 公证、Windows EV 签名、NSIS 定制安装器、内置 Python/Node/pnpm 运行时 + LibreOffice 办公引擎、PKCE 账号登录、内嵌用量页、CLI 命令管理器 | 源码安装，dmg 在路线图上 |

**版本锁死**是官方为一致性付出的最大代价（其 README 决策表：升 dsh 必发新 Desktop）；fi 恰好买到了相反的
东西——dsh 出新版当天 `npm install -g` 即可用。这不是对错，是产品形态：官方为大规模一致性负责，
fi 是个人效率工具，要的是跟上上游的速度。

`dsh-app://` 代理层买到 cookie 隔离、渲染层无端口 origin、离线静态资源，代价是自定义 scheme + 流式
反代 + WS 头改写 + boot gate 一整套机制。fi 的直接 loadURL 换来「页面就是浏览器里的 dsh，插件行为零差异」
——fi 刻意不复制那条重路线的判断依然成立。

## 三、fi 领先官方的地方（差异化资产）

1. **带载荷深链 + Finder 集成**：`fi://workspace/open?path=…` + 右键「在 fi 中打开」直达指定文件夹开新任务；
   官方 `dsh://open` 只做聚焦窗口，无载荷语义。
2. **项目模式文件浏览器**（Finder 式逐层浏览、面包屑、隐藏项显隐、文件夹里一键开任务）——官方侧栏无对应物
   （官方的 webview 侧栏浏览器是「应用内浏览网页」，不是「浏览本地项目」）。
3. 选区引用、窗口标题品牌改写、fi 自己的 cron 面板——官方均无。
4. 官方也无 dock 徽标、全局快捷键、系统通知（托盘仅 Windows 且只为找回隐藏窗口）——对 fi 路线图第 1 层
   的校准：官方认为「关窗隐藏 + 托盘找回」才是核心，徽标/通知属锦上添花。

## 四、fi 未跟进的官方做法（及原因）

- **`<html data-platform="darwin">` 标记**：dsh 的 `ShortcutsService`（`packages/client/shortcuts`）据它进入
  桌面分支并强制要求 `window.dshDesktop.keyboard` 桥，缺桥直接抛错。fi 不伪造该桥，故不设此标记；
  fi preload 只暴露两个被动探测的全局（`__DSH_HOST_PATHS__`、`__DSH_DIRECTORY_PICKER__`）。
- **`window.dshDesktop` 完整桥面**（键盘/更新/浏览器租约）：语义与官方主进程的菜单加速器、更新蒙层深度
  耦合，外挂壳复刻既费力又脆。fi 的增强统一走 fi-sidebar 插件层。
- **更新准入锁 / 503 排空**：fi 尚无自动更新，先不涉及；做 dmg + 自动更新时再参考。

## 五、借鉴落地情况

| 借鉴项 | 状态 |
|---|---|
| preload 暴露 `__DSH_HOST_PATHS__`（拖入文件 → `@path` 引用）与 `__DSH_DIRECTORY_PICKER__`（dsh 目录选择走原生对话框） | ✅ 已落地（`src/preload/index.ts`、`src/main/fs-bridge.ts`） |
| ELECTRON_RUN_AS_NODE 启动 dsh，摆脱系统 Node 依赖（官方 host 同款机制，`--expose-internals` 是其插件加载器解析 link 安装插件的硬要求） | ✅ 已落地（`src/main/dsh-process.ts` 的 `dshCliSpawn`，仅对 node 脚本 bin 生效）；内置运行时树随 dmg 打包里程碑另做 |
| macOS 关窗＝隐藏保活（会话/定时任务不中断） | ✅ 已落地（`src/main/close-guard.ts` + Dock/二次实例/深链找回） |
| 忙碌/退出检测走 `/api`（`session/list` 的 `running`，超时保守） | ✅ 已落地（`src/main/dsh-api.ts` + `close-guard.ts`，DOM 嗅探降级保留） |
| 崩溃循环安全模式：禁第三方插件并重试 | ✅ 已落地（`dsh-process.ts` crash-loop 事件 + `index.ts` 安全模式对话框） |
| 壳直连 `/api/remote.mux` 做原生 UI（路线图第 3 层） | ⏳ 方向被官方验证：api-gateway 流多路复用是官方钦定的非浏览器操作者通道，官方主进程自己就是它的客户端 |

## 六、定位启示

「Electron 壳包 dsh web」这个壳本身官方已经做了，fi 的价值不在壳，而在壳之上的三层：macOS 深度集成
（深链/Finder/路径引用）、官方没有的个人工作流功能（项目模式、选区引用、cron 面板）、以及「永远跑最新
npm dsh」的敏捷性。官方版本锁死的发布节奏恰是 fi 外挂模式的舒适区——fi 与官方 Desktop 是同一条河的
主干与支流，不是竞争关系。
