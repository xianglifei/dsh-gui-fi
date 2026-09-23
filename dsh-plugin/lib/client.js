window.__ModuleLoader__.load({
	id: "fi-sidebar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		// 手写为 dsh 客户端模块格式（与 dsh-client-ui-* bundle 同构），无构建步骤。
		// react / react-dom / primitives 是壳内置静态模块，require 即用。
		const react = require("react");
		const jsx = require("react/jsx-runtime");
		const reactDom = require("react-dom");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		//#region constants
		const NS = "fiSidebar";
		/** 普通模式背后的隐藏工作区标题；服务端半层负责保证它存在。 */
		const DEFAULT_WORKSPACE_TITLE = "default";
		const MODE_STORAGE_KEY = "fi.sidebar.mode";
		const SHOW_PROJECTS_STORAGE_KEY = "fi.sidebar.showProjectTasks";

		/** 搜索弹窗：防抖、查询长度上限、空查询时最近会话条数（均对齐 dsh 原生搜索）。 */
		const SEARCH_DEBOUNCE_MS = 250;
		const SEARCH_QUERY_MAX = 500;
		const SEARCH_RECENT_LIMIT = 8;

		const ICONS = {
			newTask: "plus",
			search: "search",
			schedule: "alarm-clock",
			plugins: "blocks",
			projectOff: "folder",
			projectOn: "folder-open",
			projectsOff: "folder-dot",
			projectsOn: "folder-open-dot",
			folderRow: "folder",
			newTaskHere: "message-circle-plus",
			back: "chevron-left",
			refresh: "rotate-cw",
			eye: "eye",
			eyeClosed: "eye-closed",
			copyPath: "copy",
			reveal: "arrow-up-right",
			open: "folder-open",
			cronActive: "clock",
			cronPaused: "circle-pause",
			cronDone: "circle-check",
			cronFailed: "triangle-alert",
			cronMore: "ellipsis",
			quote: "quote",
			quoteRemove: "x",
			quoteExpand: "chevron-down",
			quoteCollapse: "chevron-up",
			pluginInstall: "download",
			pluginRepo: "external-link",
			pluginRemove: "trash-2",
		};

		/**
		 * fi 自有 UI 的图标全量换用 Lucide 线稿：官方 path 数据内联（ISC 协议，
		 * 无运行时依赖），渲染为 24 网格 stroke 风格，颜色继承 currentColor。
		 * 表里没有的名字回落 dsh primitives（fill 风格），保证新调用点永远可用。
		 */
		const LUCIDE_INNER = {
			"plus": '<path d="M5 12h14"/><path d="M12 5v14"/>',
			"search": '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
			"alarm-clock": '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/>',
			"blocks": '<path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2"/><rect x="14" y="2" width="8" height="8" rx="1"/>',
			"folder": '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
			"folder-open": '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
			// 项目任务显隐（0.8）：关=folder-dot（默认），开=folder-open-dot
			// （lucide 0.544 官方 path）
			"folder-dot": '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><circle cx="12" cy="13" r="1"/>',
			"folder-open-dot": '<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/><circle cx="14" cy="15" r="1"/>',
			"message-circle-plus": '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M8 12h8"/><path d="M12 8v8"/>',
			"chevron-left": '<path d="m15 18-6-6 6-6"/>',
			"rotate-cw": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
			"eye": '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
			"eye-closed": '<path d="m15 18-.722-3.25"/><path d="M2 8a10.645 10.645 0 0 0 20 0"/><path d="m20 15-1.726-2.05"/><path d="m4 15 1.726-2.05"/><path d="m9 18 .722-3.25"/>',
			"copy": '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
			"arrow-up-right": '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
			"clock": '<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/>',
			"circle-check": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
			"circle-pause": '<circle cx="12" cy="12" r="10"/><path d="M10 9v6"/><path d="M14 9v6"/>',
			"triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
			"ellipsis": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
			// 选区引用（0.6）：chip/菜单的引用图标与移除、展开指示（lucide 0.544 官方 path）
			"quote": '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
			"x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
			"chevron-down": '<path d="m6 9 6 6 6-6"/>',
			"chevron-up": '<path d="m18 15-6-6-6 6"/>',
			// 插件中心（0.7）：安装按钮与仓库外链（lucide 0.544 官方 path，
			// polyline/line 折算成 path 保持表内图元风格一致）
			"download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
			"external-link": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
			"trash-2": '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
		};

		function icon(name, size) {
			const inner = LUCIDE_INNER[name];
			if (inner !== undefined) {
				return jsx.jsx("svg", {
					width: size ?? 16,
					height: size ?? 16,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 2,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					dangerouslySetInnerHTML: { __html: inner },
				});
			}
			const Icon = primitives[name];
			return Icon === undefined ? null : jsx.jsx(Icon, { size: size ?? 16 });
		}
		//#endregion

		//#region locales
		const zh = {
			"newTask": "新建任务",
			"search": "搜索",
			"search.placeholder": "搜索会话…",
			"search.recent": "最近",
			"search.searching": "正在搜索…",
			"search.empty": "没有找到相关会话",
			"search.more": "结果较多，试试更具体的关键词",
			"search.unavailable": "消息内容搜索暂不可用，当前仅匹配标题",
			"schedule": "定时任务",
			"plugins": "插件中心",
			"mode.project": "项目模式",
			"section.tasks": "任务",
			"section.toggleProjects": "显示或隐藏项目任务",
			"session.new": "新任务",
			"row.open.aria": "打开会话「{name}」",
			"row.newTaskHere": "在此文件夹新建任务",
			"empty.none": "暂无会话",
			"empty.loading": "正在加载…",
			"empty.projects": "项目文件夹里还没有任务",
			"fb.back": "返回上一级",
			"fb.refresh": "刷新",
			"fb.toggleHidden": "显示或隐藏隐藏文件",
			"fb.loading": "正在加载…",
			"fb.emptyDir": "空文件夹",
			"fb.denied": "没有权限读取这个文件夹",
			"fb.notFound": "文件夹不存在或已被移动",
			"fb.notDirectory": "这个路径不是文件夹",
			"fb.errorOther": "读取失败：{msg}",
			"fb.truncated": "目录过大，仅显示前 {n} 项",
			"fb.desktopOnly": "文件浏览仅限 fi 桌面版使用",
			"fb.copyPath": "复制路径",
			"fb.reveal": "在 Finder 中显示",
			"fb.open": "打开",
			"fb.openFailed": "无法打开：{msg}",
			"fb.taskFailed": "新建任务失败：{msg}",
			"time.now": "刚刚",
			"time.minutes": "{n}分钟",
			"time.hours": "{n}小时",
			"time.days": "{n}天",
			"time.months": "{n}个月",
			"time.years": "{n}年",
			"cron.title": "定时任务",
			"cron.subtitle": "按计划自动新建会话并执行提示词",
			"cron.refresh": "刷新",
			"cron.create": "新建任务",
			"cron.desktopOnly": "定时任务仅限 fi 桌面版使用",
			"cron.empty.title": "还没有定时任务",
			"cron.filter.all": "全部",
			"cron.filter.inProgress": "进行中",
			"cron.filter.completed": "已完成",
			"cron.filter.failed": "失败",
			"cron.filter.empty": "没有符合条件的任务",
			"cron.status.active": "运行中",
			"cron.status.paused": "已暂停",
			"cron.status.completed": "已完成",
			"cron.status.failed": "已失败",
			"cron.count": "已运行 {n} 次",
			"cron.next": "下次运行 {when}",
			"cron.soon": "即将运行",
			"cron.in.minutes": "{n} 分钟后",
			"cron.in.hours": "{n} 小时后",
			"cron.in.days": "{n} 天后",
			"cron.schedule.everyMinutes": "每 {n} 分钟",
			"cron.schedule.daily": "每天 {time}",
			"cron.schedule.weekly": "每周{days} {time}",
			"cron.schedule.monthly": "每月 {day} 日 {time}",
			"cron.join": "、",
			"cron.weekday.0": "日",
			"cron.weekday.1": "一",
			"cron.weekday.2": "二",
			"cron.weekday.3": "三",
			"cron.weekday.4": "四",
			"cron.weekday.5": "五",
			"cron.weekday.6": "六",
			"cron.lastError": "上次运行失败",
			"cron.menu.runNow": "立即运行",
			"cron.menu.openSession": "打开最近会话",
			"cron.menu.enable": "重新启用",
			"cron.menu.pause": "暂停",
			"cron.menu.resume": "恢复",
			"cron.menu.edit": "编辑",
			"cron.menu.delete": "删除",
			"cron.menu.confirmDelete": "确认删除",
			"cron.op.failed": "操作失败：{msg}",
			"cron.form.newTitle": "新建定时任务",
			"cron.form.editTitle": "编辑定时任务",
			"cron.form.name": "标题",
			"cron.form.namePlaceholder": "例如：每天早上检查一次构建",
			"cron.form.location": "执行位置",
			"cron.form.locationDefault": "默认工作区",
			"cron.form.locationFolder": "项目文件夹",
			"cron.form.locationDefaultHint": "运行会话进入普通模式任务清单",
			"cron.form.locationFolderHint": "运行会话归属该文件夹的项目工作区",
			"cron.form.pick": "选择文件夹…",
			"cron.form.noFolder": "未选择文件夹",
			"cron.form.repeat": "重复",
			"cron.form.unit.minute": "每 N 分钟",
			"cron.form.unit.day": "按天",
			"cron.form.unit.week": "按周",
			"cron.form.unit.month": "按月",
			"cron.form.interval": "间隔",
			"cron.form.intervalUnit.minutes": "分钟",
			"cron.form.intervalUnit.days": "天",
			"cron.form.intervalUnit.weeks": "周",
			"cron.form.intervalUnit.months": "个月",
			"cron.form.time": "时间",
			"cron.form.weekdays": "星期",
			"cron.form.monthDay": "日期（1-28）",
			"cron.form.plan": "次数上限",
			"cron.form.plan.forever": "不限",
			"cron.form.plan.limited": "限 N 次",
			"cron.form.maxRuns": "次数",
			"cron.form.prompt": "提示词",
			"cron.form.promptPlaceholder": "每次触发时要 agent 做什么",
			"cron.form.save": "保存",
			"cron.form.cancel": "取消",
			"cron.form.saving": "保存中…",
			"cron.validate.name": "请填写标题",
			"cron.validate.prompt": "请填写提示词",
			"cron.validate.folder": "请选择项目文件夹",
			"cron.validate.weekdays": "请至少选择一个星期",
			"cron.validate.interval": "间隔至少为 1",
			"cron.validate.maxRuns": "次数至少为 1",
			"plugin.title": "插件中心",
			"plugin.subtitle": "管理安装在 fi 里的 dsh 插件",
			"plugin.refresh": "刷新",
			"plugin.installed": "已安装",
			"plugin.installed.empty": "还没有安装插件。可以从下方推荐一键安装，或用命令行 dsh plugin --profile fi add <包名> 自行安装。",
			"plugin.recommended": "推荐",
			"plugin.install": "安装",
			"plugin.installing": "安装中…",
			"plugin.installedBadge": "已安装",
			"plugin.installedNote": "安装成功，重启 fi 后生效",
			"plugin.installFailed": "安装失败：{msg}",
			"plugin.uninstall": "卸载",
			"plugin.uninstallConfirm": "确认卸载",
			"plugin.uninstalledNote": "已卸载，重启 fi 后生效",
			"plugin.uninstallFailed": "卸载失败：{msg}",
			"plugin.desktopOnly": "插件中心仅限 fi 桌面版使用",
			"plugin.repo": "查看 GitHub 仓库",
			"plugin.rec.dsh-whale-widget.desc": "右下角余额小鲸鱼挂件：余额、今日已用、峰谷定价一目了然",
			"plugin.rec.dsh-fx-review.desc": "右侧栏 Markdown 预览变批注审阅：选中文字做 CriticMarkup 批注，一键复制交回模型修改（fx-review 嵌入版）",
			"quote.addToTask": "添加到当前任务",
			"quote.tooLong": "单条引用过长（上限 {n} 字）",
			"quote.count": "引用 · {n}",
			"quote.remove": "移除这条引用",
			"quote.clear": "全部清除",
			"quote.source": "引用 · {kind}",
			"quote.kind.user": "用户消息",
			"quote.kind.assistant": "助手回复",
			"quote.kind.reasoning": "思考过程",
			"quote.kind.tool": "工具输出",
			"quote.limit.count": "引用条数已达上限（{n} 条）",
			"quote.limit.total": "引用总长度已达上限",
		};
		const en = {
			"newTask": "New Task",
			"search": "Search",
			"search.placeholder": "Search sessions…",
			"search.recent": "Recent",
			"search.searching": "Searching…",
			"search.empty": "No matching sessions",
			"search.more": "Many matches — try a more specific query",
			"search.unavailable": "Content search is unavailable — matching titles only",
			"schedule": "Scheduled",
			"plugins": "Plugins",
			"mode.project": "Projects",
			"section.tasks": "Tasks",
			"section.toggleProjects": "Show or hide project tasks",
			"session.new": "New Task",
			"row.open.aria": "Open session \"{name}\"",
			"row.newTaskHere": "New task in this folder",
			"empty.none": "No sessions yet",
			"empty.loading": "Loading…",
			"empty.projects": "No tasks in project folders yet",
			"fb.back": "Up one level",
			"fb.refresh": "Refresh",
			"fb.toggleHidden": "Show or hide hidden files",
			"fb.loading": "Loading…",
			"fb.emptyDir": "Empty folder",
			"fb.denied": "No permission to read this folder",
			"fb.notFound": "Folder not found or moved",
			"fb.notDirectory": "Not a folder",
			"fb.errorOther": "Failed to read: {msg}",
			"fb.truncated": "Large directory — showing first {n} entries",
			"fb.desktopOnly": "File browsing is available in the fi desktop app only",
			"fb.copyPath": "Copy Path",
			"fb.reveal": "Reveal in Finder",
			"fb.open": "Open",
			"fb.openFailed": "Cannot open: {msg}",
			"fb.taskFailed": "Failed to create task: {msg}",
			"time.now": "now",
			"time.minutes": "{n}m",
			"time.hours": "{n}h",
			"time.days": "{n}d",
			"time.months": "{n}mo",
			"time.years": "{n}y",
			"cron.title": "Scheduled Tasks",
			"cron.subtitle": "Create sessions and run prompts on a schedule",
			"cron.refresh": "Refresh",
			"cron.create": "New Task",
			"cron.desktopOnly": "Scheduled tasks are available in the fi desktop app only",
			"cron.empty.title": "No scheduled tasks yet",
			"cron.filter.all": "All",
			"cron.filter.inProgress": "In Progress",
			"cron.filter.completed": "Completed",
			"cron.filter.failed": "Failed",
			"cron.filter.empty": "No tasks match this filter",
			"cron.status.active": "Active",
			"cron.status.paused": "Paused",
			"cron.status.completed": "Completed",
			"cron.status.failed": "Failed",
			"cron.count": "Ran {n} times",
			"cron.next": "Next run {when}",
			"cron.soon": "Running soon",
			"cron.in.minutes": "in {n} min",
			"cron.in.hours": "in {n} h",
			"cron.in.days": "in {n} d",
			"cron.schedule.everyMinutes": "Every {n} min",
			"cron.schedule.daily": "Daily at {time}",
			"cron.schedule.weekly": "Weekly on {days} at {time}",
			"cron.schedule.monthly": "Monthly on day {day} at {time}",
			"cron.join": ", ",
			"cron.weekday.0": "Sun",
			"cron.weekday.1": "Mon",
			"cron.weekday.2": "Tue",
			"cron.weekday.3": "Wed",
			"cron.weekday.4": "Thu",
			"cron.weekday.5": "Fri",
			"cron.weekday.6": "Sat",
			"cron.lastError": "Last run failed",
			"cron.menu.runNow": "Run Now",
			"cron.menu.openSession": "Open Last Session",
			"cron.menu.enable": "Re-enable",
			"cron.menu.pause": "Pause",
			"cron.menu.resume": "Resume",
			"cron.menu.edit": "Edit",
			"cron.menu.delete": "Delete",
			"cron.menu.confirmDelete": "Confirm Delete",
			"cron.op.failed": "Action failed: {msg}",
			"cron.form.newTitle": "New Scheduled Task",
			"cron.form.editTitle": "Edit Scheduled Task",
			"cron.form.name": "Title",
			"cron.form.namePlaceholder": "e.g. Morning build check",
			"cron.form.location": "Run In",
			"cron.form.locationDefault": "Default Workspace",
			"cron.form.locationFolder": "Project Folder",
			"cron.form.locationDefaultHint": "Runs appear in the normal-mode task list",
			"cron.form.locationFolderHint": "Runs are filed under that folder's project workspace",
			"cron.form.pick": "Choose Folder…",
			"cron.form.noFolder": "No folder selected",
			"cron.form.repeat": "Repeat",
			"cron.form.unit.minute": "Every N minutes",
			"cron.form.unit.day": "Daily",
			"cron.form.unit.week": "Weekly",
			"cron.form.unit.month": "Monthly",
			"cron.form.interval": "Interval",
			"cron.form.intervalUnit.minutes": "min",
			"cron.form.intervalUnit.days": "days",
			"cron.form.intervalUnit.weeks": "weeks",
			"cron.form.intervalUnit.months": "months",
			"cron.form.time": "Time",
			"cron.form.weekdays": "Weekdays",
			"cron.form.monthDay": "Day of month (1-28)",
			"cron.form.plan": "Run Limit",
			"cron.form.plan.forever": "Unlimited",
			"cron.form.plan.limited": "Limited to N runs",
			"cron.form.maxRuns": "Runs",
			"cron.form.prompt": "Prompt",
			"cron.form.promptPlaceholder": "What the agent should do on each run",
			"cron.form.save": "Save",
			"cron.form.cancel": "Cancel",
			"cron.form.saving": "Saving…",
			"cron.validate.name": "Enter a title",
			"cron.validate.prompt": "Enter a prompt",
			"cron.validate.folder": "Choose a project folder",
			"cron.validate.weekdays": "Pick at least one weekday",
			"cron.validate.interval": "Interval must be at least 1",
			"cron.validate.maxRuns": "Runs must be at least 1",
			"plugin.title": "Plugin Center",
			"plugin.subtitle": "Manage the dsh plugins installed in fi",
			"plugin.refresh": "Refresh",
			"plugin.installed": "Installed",
			"plugin.installed.empty": "No plugins installed yet. Pick one from the recommendations below, or install your own with dsh plugin --profile fi add <package>.",
			"plugin.recommended": "Recommended",
			"plugin.install": "Install",
			"plugin.installing": "Installing…",
			"plugin.installedBadge": "Installed",
			"plugin.installedNote": "Installed. Restart fi to activate.",
			"plugin.installFailed": "Install failed: {msg}",
			"plugin.uninstall": "Uninstall",
			"plugin.uninstallConfirm": "Confirm Uninstall",
			"plugin.uninstalledNote": "Uninstalled. Restart fi to fully unload.",
			"plugin.uninstallFailed": "Uninstall failed: {msg}",
			"plugin.desktopOnly": "The plugin center is available in the fi desktop app only",
			"plugin.repo": "View the GitHub repository",
			"plugin.rec.dsh-whale-widget.desc": "A little whale widget for your DeepSeek balance, today's usage and peak/off-peak pricing",
			"plugin.rec.dsh-fx-review.desc": "Turn the right-sidebar Markdown preview into a review surface: annotate text with CriticMarkup, copy the annotated document back to the model (fx-review embedded)",
			"quote.addToTask": "Add to Current Task",
			"quote.tooLong": "Selection is too long to quote (max {n} characters)",
			"quote.count": "Quotes · {n}",
			"quote.remove": "Remove this quote",
			"quote.clear": "Clear All",
			"quote.source": "Quote · {kind}",
			"quote.kind.user": "user message",
			"quote.kind.assistant": "assistant reply",
			"quote.kind.reasoning": "reasoning",
			"quote.kind.tool": "tool output",
			"quote.limit.count": "Quote limit reached ({n} items)",
			"quote.limit.total": "Total quote length limit reached",
		};

		/** 词典键对应的参数：time.* 接 {n}。 */
		function format(template, params) {
			return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
		}
		//#endregion

		//#region styles
		// 折叠成 56px rail 时本区域整体让位；旧的「新会话」按钮由 fi 按钮列取代。
		// 选择器只匹配类名尾段（CSS Modules 哈希前缀会随构建变化，语义段不变）。
		const css = `
button[class*="_newSession"] { display: none !important; }
.fi-region { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.fi-region--rail { display: none; }
/* dsh 页面无全局 border-box 重置：这些行 width:100% 又带横向 padding，
   content-box 下会把悬浮背景与尾部控件（时间戳/新建任务按钮）顶出容器
   右缘，文件浏览器的新建任务按钮因此压到侧栏边缘。 */
.fi-action, .fi-row, .fi-fb-row, .fi-fb-menu-item, .fi-search-row, .fi-cron-row { box-sizing: border-box; }
/* 左缘对齐 dsh 底部设置行：设置图标起于侧栏 x=18（root 12px 内边距 -
   triggerRow 负 margin 2 + trigger 左内边距 8）；fi 按钮列以 -2px 外边距
   抵消区域缩进、8px 左内边距落回同一条竖线。右缘 6px 与任务列表行的
   悬浮高亮条（.fi-list 右内边距 6px）对齐同一节奏。 */
.fi-actions { display: flex; flex-direction: column; flex: none; gap: 4px; margin: 2px 6px 10px -2px; }
.fi-action { display: flex; align-items: center; justify-content: flex-start; gap: 7px;
  width: 100%; height: 36px; padding: 0 12px 0 8px; border: none; border-radius: 10px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 13.5px; font-weight: 500; line-height: 20px;
  cursor: pointer; white-space: nowrap; }
.fi-region--rail .fi-action { justify-content: center; padding: 0; }
.fi-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.fi-action:active { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
/* 常驻高亮两种语义共用同一配方：aria-pressed=开合态（定时任务面板）、
   aria-current=page=当前位置（右侧停在新任务页）。 */
.fi-action[aria-pressed="true"], .fi-action[aria-current="page"] { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.fi-action:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
/* 项目模式入口：注入到 dsh 侧栏 logo 行（收起按钮左侧）的容器与按钮 */
.fi-ws-toggle-host { display: inline-flex; flex: none; }
.fi-ws-toggle { corner-shape: round; cursor: pointer; width: 28px; height: 28px;
  color: var(--dsw-alias-label-secondary); background: transparent; border: none;
  border-radius: 50%; flex: none; justify-content: center; align-items: center;
  padding: 0; display: inline-flex; }
.fi-ws-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.fi-ws-toggle:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-ws-toggle[aria-pressed="true"] { color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-active); }
[class*="_collapsed"] .fi-ws-toggle-host { display: none; }
/* 分组标题行：复刻 dsh WorkspaceBrowser sectionHeader 的样式配方
   （高 36px、三级灰、line-height 20px、padding-left 4px）；右侧挂项目任务
   显隐开关，右缘与 logo 行「收起侧栏」按钮同一条垂线（CDP 实测：fi-region
   跨侧栏内容全宽，logoRow 比它再内缩 12px，收起按钮右缘贴 logoRow 右缘，
   故右内边距取 12px；与任务行高亮条右缘的 6px 是两条不同的节奏线）。 */
.fi-section { box-sizing: border-box; height: 36px; flex: none; align-items: center;
  margin: 2px 0 4px; padding: 0 12px 0 4px; display: flex;
  color: var(--dsw-alias-label-tertiary); overflow: hidden; }
.fi-section-label { flex: 1; white-space: nowrap; min-width: 0; line-height: 20px; overflow: hidden; }
/* 项目任务显隐开关（0.8）：与 logo 行收起按钮/项目模式入口同规格的 28px
   图标按钮（圆形、右缘和中心都落在同一条垂线上），开=folder-open-dot
   （含 bg 常驻），关=folder-dot */
.fi-section-toggle { flex: none; width: 28px; height: 28px; border: none; border-radius: 50%;
  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.fi-section-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.fi-section-toggle:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-section-toggle[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.fi-list { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 6px 16px 2px;
  scrollbar-width: thin; scrollbar-color: var(--dsh-scrollbar-thumb, transparent) transparent; }
.fi-row { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px;
  padding: 6px 8px; border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px;
  text-align: left; cursor: pointer; }
.fi-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.fi-row:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-row[data-selected="true"] { background: var(--dsw-alias-interactive-bg-active); font-weight: 500; }
.fi-row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fi-row-time { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
/* 项目任务分组头（「显示项目任务」展开后）：比一级标题矮一档、小一号，
   文件夹图标 + 工作区名（文件夹名），margin-top 与上方行组拉开距离 */
.fi-group { box-sizing: border-box; height: 28px; flex: none; display: flex; align-items: center;
  gap: 6px; margin-top: 6px; padding: 0 8px; overflow: hidden;
  color: var(--dsw-alias-label-tertiary); }
.fi-group-icon { flex: none; display: inline-flex; color: var(--dsw-alias-label-secondary); }
.fi-group-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12.5px; line-height: 18px; }
.fi-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.fi-dot--running { background: var(--dsw-alias-state-success-primary); }
.fi-dot--pending { background: var(--dsw-alias-state-business-primary); }
.fi-empty { color: var(--dsw-alias-label-tertiary); padding: 16px 10px; font-size: 13px; }
.fi-loading { color: var(--dsw-alias-label-tertiary); padding: 16px 10px; font-size: 13px; }
/* 项目模式文件浏览器：路径条 + 当前目录列表（逐层进入，非树形展开） */
.fi-fb { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* 右缘对齐文件夹行的新建任务按钮：列表右 6px + 行右 6px = 12px，
   与 dsh 侧栏 12px 内联内边距同一节奏；左缘 2px 与行悬浮背景左缘（14px）齐平。 */
.fi-fb-bar { flex: none; display: flex; align-items: center; gap: 1px; padding: 0 12px 6px 2px; }
.fi-fb-nav { flex: none; width: 24px; height: 24px; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.fi-fb-nav:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.fi-fb-nav:disabled { opacity: 0.4; cursor: default; background: transparent; color: var(--dsw-alias-label-secondary); }
.fi-fb-nav:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-fb-nav[aria-pressed="true"] { color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-active); }
.fi-fb-crumbs { flex: 1; min-width: 0; display: flex; align-items: center; overflow-x: auto;
  scrollbar-width: none; white-space: nowrap; padding: 2px; }
.fi-fb-crumbs::-webkit-scrollbar { display: none; }
.fi-fb-crumb { flex: none; max-width: 140px; overflow: hidden; text-overflow: ellipsis;
  border: none; border-radius: 6px; padding: 2px 4px; background: transparent;
  color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 12.5px; line-height: 18px; cursor: pointer; }
.fi-fb-crumb:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.fi-fb-crumb[aria-current="true"] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.fi-fb-sep { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 11px; user-select: none; }
.fi-fb-list { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 6px 16px 2px;
  scrollbar-width: thin; scrollbar-color: var(--dsh-scrollbar-thumb, transparent) transparent; }
.fi-fb-row { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 32px;
  padding: 5px 6px 5px 8px; border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13.5px; line-height: 20px;
  text-align: left; cursor: pointer; }
.fi-fb-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.fi-fb-row:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-fb-row--other, .fi-fb-row--other:hover { color: var(--dsw-alias-label-tertiary); cursor: default; background: transparent; }
/* 隐藏项（点前缀）整行置灰：名字与图标一起降到三级灰，悬浮背景保留 */
.fi-fb-row--hidden { color: var(--dsw-alias-label-tertiary); }
.fi-fb-row--hidden .fi-fb-row-icon { color: var(--dsw-alias-label-tertiary); }
.fi-fb-row-icon { flex: none; display: inline-flex; color: var(--dsw-alias-label-secondary); }
.fi-fb-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fi-fb-new { flex: none; width: 24px; height: 24px; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.fi-fb-new:hover { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.fi-fb-new:disabled { opacity: 0.5; cursor: default; }
.fi-fb-note { color: var(--dsw-alias-label-tertiary); padding: 14px 10px; font-size: 13px; }
.fi-fb-status { flex: none; color: var(--dsw-alias-state-danger-primary, #d33); padding: 0 10px 6px;
  font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fi-fb-menu { position: fixed; z-index: 1000; min-width: 176px; padding: 4px;
  background: var(--dsw-alias-bg-layer-1); border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16); }
.fi-fb-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; height: 30px;
  padding: 0 10px; border: none; border-radius: 6px; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 18px;
  cursor: pointer; text-align: left; white-space: nowrap; }
.fi-fb-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
	.fi-fb-menu-item:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
/* 搜索弹窗：ZCode 式居中面板 + 全屏模糊遮罩。portal 到 body，脱离侧栏布局；
   层级须压过 dsh 自身浮层（fi 右键菜单为 1000）。 */
.fi-search-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex;
  align-items: flex-start; justify-content: center; padding: 12vh 24px 24px;
  background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px);
  animation: fi-search-fade 0.12s ease-out; }
.fi-search-panel { display: flex; flex-direction: column; width: min(560px, 100%);
  max-height: 74vh; overflow: hidden; border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 16px; background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.24);
  animation: fi-search-pop 0.14s var(--ds-ease-in-out, ease-out); }
.fi-search-field { flex: none; display: flex; align-items: center; gap: 8px;
  margin: 10px 10px 8px; height: 36px; padding: 0 12px; border-radius: 999px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  background: var(--dsw-alias-button-elevated-fill, transparent);
  color: var(--dsw-alias-label-secondary); }
.fi-search-field:focus-within { border-color: var(--dsw-alias-label-tertiary); }
.fi-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; }
.fi-search-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.fi-search-list { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 6px 10px;
  scrollbar-width: thin; scrollbar-color: var(--dsh-scrollbar-thumb, transparent) transparent; }
.fi-search-label { box-sizing: border-box; height: 28px; display: flex; align-items: center;
  padding: 0 10px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.fi-search-row { display: flex; flex-direction: column; align-items: stretch; gap: 1px; width: 100%;
  min-height: 44px; padding: 6px 10px; border: none; border-radius: 10px; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; text-align: left; cursor: pointer; }
.fi-search-row[data-active="true"], .fi-search-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.fi-search-row-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.fi-search-row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 14px; line-height: 20px; }
.fi-search-row-meta { flex: none; display: flex; align-items: center; gap: 8px; margin-left: 4px;
  color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 20px; }
.fi-search-row-ws { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fi-search-snippet { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding-left: 15px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 17px; }
.fi-search-mark { border-radius: 3px; color: inherit; font-weight: 600;
  background: var(--dsw-alias-interactive-bg-hover);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, transparent); }
.fi-search-note { color: var(--dsw-alias-label-tertiary); padding: 14px 10px; font-size: 13px; }
.fi-search-more { color: var(--dsw-alias-label-tertiary); padding: 8px 10px 12px; font-size: 12px; text-align: center; }
@keyframes fi-search-fade { from { opacity: 0; } }
@keyframes fi-search-pop { from { opacity: 0; transform: scale(0.97); } }
@media (prefers-reduced-motion: reduce) { .fi-search-backdrop, .fi-search-panel { animation: none; } }
/* 定时任务面板：portal 到 body 的整页覆盖层，左缘内联 style.left 跟随侧栏宽度。
   层级低于右键菜单(1000)与搜索弹窗(1200)，高于普通页面内容。 */
.fi-cron-root { position: fixed; top: 0; right: 0; bottom: 0; z-index: 900;
  background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column;
  animation: fi-cron-fade 0.14s ease-out; }
.fi-cron-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin;
  scrollbar-color: var(--dsh-scrollbar-thumb, transparent) transparent; }
.fi-cron-inner { max-width: 860px; margin: 0 auto; padding: 28px 32px 48px;
  display: flex; flex-direction: column; gap: 16px; width: 100%; box-sizing: border-box; }
.fi-cron-head { display: flex; align-items: flex-end; gap: 12px; }
.fi-cron-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fi-cron-title { display: flex; align-items: center; gap: 8px;
  font-size: 20px; font-weight: 600; line-height: 28px; color: var(--dsw-alias-label-primary); }
.fi-cron-sub { color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 18px; }
.fi-cron-head-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; flex: none; }
.fi-cron-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.fi-cron-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.fi-cron-btn:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-cron-btn:disabled { opacity: 0.5; cursor: default; }
.fi-cron-btn--primary { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-1);
  border-color: transparent; font-weight: 500; }
.fi-cron-btn--primary:hover { opacity: 0.92; background: var(--dsw-alias-label-primary); }
.fi-cron-btn--danger { color: var(--dsw-alias-state-danger-primary); border-color: currentColor; background: transparent; }
.fi-cron-iconbtn { width: 32px; padding: 0; }
.fi-cron-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.fi-cron-chip { height: 26px; padding: 0 12px; border: none; border-radius: 999px;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  font: inherit; font-size: 13px; cursor: pointer; }
.fi-cron-chip:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.fi-cron-chip:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-cron-chip[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary); font-weight: 500; }
.fi-cron-list { display: flex; flex-direction: column; gap: 8px; }
.fi-cron-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px;
  border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font: inherit; text-align: left; cursor: pointer; }
.fi-cron-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.fi-cron-row:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
/* 已完成任务静态弱化（对齐 ZCode：hover 不恢复） */
.fi-cron-row--done { opacity: 0.6; }
.fi-cron-row--done:hover { background: var(--dsw-alias-bg-layer-1); }
.fi-cron-status { flex: none; display: inline-flex; }
.fi-cron-status--active { color: var(--dsw-alias-state-success-primary); }
.fi-cron-status--paused, .fi-cron-status--completed { color: var(--dsw-alias-label-tertiary); }
.fi-cron-status--failed { color: var(--dsw-alias-state-danger-primary); }
.fi-cron-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.fi-cron-name { font-size: 14px; font-weight: 500; line-height: 20px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fi-cron-meta { display: flex; align-items: center; gap: 8px; min-width: 0;
  font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.fi-cron-badge { display: inline-flex; align-items: center; gap: 4px; min-width: 0;
  padding: 1px 8px 1px 5px; border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);
  color: var(--dsw-alias-state-success-primary); }
.fi-cron-badge--dim { opacity: 0.55; }
.fi-cron-badge-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fi-cron-failed { flex: none; display: inline-flex; align-items: center; gap: 4px;
  color: var(--dsw-alias-state-danger-primary); }
.fi-cron-count { flex: none; }
.fi-cron-more { flex: none; width: 28px; height: 28px; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.fi-cron-more:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.fi-cron-empty { border: 0.5px dashed var(--dsw-alias-border-l3); border-radius: 16px; min-height: 226px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  color: var(--dsw-alias-label-tertiary); font-size: 14px; }
.fi-cron-note { color: var(--dsw-alias-label-tertiary); padding: 12px 2px; font-size: 13px; }
.fi-cron-alert { color: var(--dsw-alias-state-danger-primary); padding: 0 2px; font-size: 12.5px; min-height: 18px; }
.fi-cron-form { display: flex; flex-direction: column; gap: 16px; }
.fi-cron-field { display: flex; flex-direction: column; gap: 6px; }
.fi-cron-label { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.fi-cron-hint { font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-tertiary); }
.fi-cron-input, .fi-cron-textarea { border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13.5px; line-height: 20px; padding: 7px 10px; outline: none; min-width: 0; }
.fi-cron-input:focus-visible, .fi-cron-textarea:focus-visible { border-color: var(--dsw-alias-label-tertiary); }
.fi-cron-textarea { resize: vertical; min-height: 96px; }
.fi-cron-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover); width: fit-content; }
.fi-cron-seg > button { border: none; border-radius: 8px; background: transparent; height: 28px;
  padding: 0 12px; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.fi-cron-seg > button:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-cron-seg > button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font-weight: 500; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); }
.fi-cron-grid2 { display: grid; grid-template-columns: auto auto; gap: 12px 24px; justify-content: start; }
.fi-cron-wd { display: flex; gap: 4px; flex-wrap: wrap; }
.fi-cron-wd > button { width: 34px; height: 28px; border-radius: 8px;
  border: 0.5px solid var(--dsw-alias-border-l3); background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12.5px; cursor: pointer; }
.fi-cron-wd > button:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-cron-wd > button[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary); border-color: transparent; }
.fi-cron-path { display: flex; align-items: center; gap: 8px; }
.fi-cron-path-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px; color: var(--dsw-alias-label-secondary); }
.fi-cron-foot { display: flex; justify-content: flex-end; gap: 8px; }
		@keyframes fi-cron-fade { from { opacity: 0; } }
		@media (prefers-reduced-motion: reduce) { .fi-cron-root { animation: none; } }
		/* 插件中心（0.7）：与定时任务同为右侧整页面板，骨架复用 fi-cron-root/
		   scroll/inner/head 系列；这里只补分区标题与插件行。行样式沿 fi-cron-row
		   的视觉语言，但不可点击（信息行 + 行尾动作）。 */
		.fi-plugin-section { display: flex; align-items: center; gap: 6px; margin-top: 4px;
		  color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
		.fi-plugin-list { display: flex; flex-direction: column; gap: 8px; }
		.fi-plugin-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px;
		  border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 12px;
		  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; }
		.fi-plugin-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
		.fi-plugin-name-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
		.fi-plugin-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		  font-size: 14px; font-weight: 500; line-height: 20px; }
		.fi-plugin-ver { flex: none; padding: 1px 8px; border-radius: 6px;
		  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-tertiary);
		  font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
		.fi-plugin-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		  font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
		.fi-plugin-repo { flex: none; display: inline-flex; align-items: center; gap: 5px;
		  color: var(--dsw-alias-label-tertiary); font-size: 12.5px; line-height: 18px;
		  text-decoration: none; cursor: pointer; }
		.fi-plugin-repo:hover { color: var(--dsw-alias-label-primary); }
		.fi-plugin-repo:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; border-radius: 4px; }
		.fi-plugin-installed { flex: none; display: inline-flex; align-items: center; gap: 5px;
		  color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 18px; }
		/* 已安装行的卸载按钮：常态安静图标钮，两步确认时展开为危险描边钮。 */
		.fi-plugin-uninstall { flex: none; display: inline-flex; align-items: center; justify-content: center;
		  gap: 5px; width: 28px; height: 28px; padding: 0; border: 0.5px solid transparent; border-radius: 6px;
		  background: transparent; color: var(--dsw-alias-label-tertiary); font: inherit;
		  font-size: 12.5px; line-height: 18px; cursor: pointer; }
		.fi-plugin-uninstall:hover { background: var(--dsw-alias-interactive-bg-hover);
		  color: var(--dsw-alias-state-danger-primary); }
		.fi-plugin-uninstall:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
		.fi-plugin-uninstall:disabled { opacity: 0.5; cursor: default; }
		.fi-plugin-uninstall--confirm { width: auto; padding: 0 10px;
		  color: var(--dsw-alias-state-danger-primary); border-color: currentColor; }
		.fi-plugin-empty { border: 0.5px dashed var(--dsw-alias-border-l3); border-radius: 12px;
		  padding: 20px 16px; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; }
		.fi-plugin-note { color: var(--dsw-alias-state-success-primary); padding: 0 2px;
		  font-size: 12.5px; line-height: 18px; min-height: 18px; }
		/* 选区引用（0.6）：对话记录选中文字后的悬浮菜单，portal 到 body。
   层级压过搜索弹窗(1200)与右键菜单(1000)——它是唯一的瞬时交互层。 */
.fi-quote-menu { position: fixed; z-index: 1300; display: flex; overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  font: inherit; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-primary); }
.fi-quote-menu-action { display: inline-flex; align-items: center; gap: 6px; border: none;
  padding: 6px 12px; background: transparent; color: inherit; font: inherit; cursor: pointer;
  white-space: nowrap; }
.fi-quote-menu-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
.fi-quote-menu-action:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-quote-menu-note { padding: 6px 12px; color: var(--dsw-alias-state-warn-label, #a86800); }
/* 引用 chip：挂在输入框卡片正上方（conversation.input.dock 槽位内）。
   卡片是居中限宽的（对话区还可拖宽），槽位容器是全宽的——左对齐会贴到
   侧栏；组件运行时读 data-composer-card 的位置把内容对齐到卡片左缘。 */
.fi-quote-dock { display: flex; flex-direction: column; gap: 4px; padding-bottom: 6px;
  box-sizing: border-box; }
.fi-quote-chip { display: inline-flex; align-items: center; gap: 5px; width: fit-content;
  height: 26px; padding: 0 12px; border: none; border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12.5px; cursor: pointer; }
.fi-quote-chip:hover { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.fi-quote-chip:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-quote-note { color: var(--dsw-alias-state-warn-label, #a86800); font-size: 12px; line-height: 17px; padding: 0 2px; }
.fi-quote-list { display: flex; flex-direction: column; gap: 2px; padding: 4px;
  border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1); max-width: min(560px, 100%); }
.fi-quote-item { display: flex; align-items: flex-start; gap: 6px; padding: 4px 4px 4px 8px;
  border-radius: 8px; }
.fi-quote-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.fi-quote-item-text { flex: 1; min-width: 0; font-size: 12.5px; line-height: 17px;
  color: var(--dsw-alias-label-secondary); white-space: pre-wrap; word-break: break-word;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.fi-quote-remove { flex: none; width: 22px; height: 22px; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.fi-quote-remove:hover { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.fi-quote-remove:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.fi-quote-clear { align-self: flex-end; border: none; background: transparent;
  color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 12px; cursor: pointer; padding: 2px 6px; }
.fi-quote-clear:hover { color: var(--dsw-alias-label-primary); }
`;
		const CSS_TAG_ID = "fi-sidebar/sidebar.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_TAG_ID}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "fi-sidebar";
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region data
		/**
		 * 普通模式「显示项目任务」的选择持久在 localStorage，跨重启生效。
		 * 键缺省 = 不展示（未动过开关时的默认，任务清单只看 default 工作区）；
		 * 用户点过开关后以存储的选择为准（与文件浏览器的 showHidden 同款口径）。
		 */
		function readShowProjects() {
			try {
				return window.localStorage.getItem(SHOW_PROJECTS_STORAGE_KEY) === "1";
			} catch {
				return false;
			}
		}
		function writeShowProjects(value) {
			try {
				window.localStorage.setItem(SHOW_PROJECTS_STORAGE_KEY, value ? "1" : "0");
			} catch { /* 存储不可用时仅退化为不记忆 */ }
		}

		/**
		 * default 工作区的会话行，按最近更新逆序（同分按 id 稳定排序，规则对齐
		 * dsh WorkspaceBrowser 的 byRecency）。可见性与 dsh 一致：排除子代理行、
		 * 已归档行；blank 行只保留当前那条（未发送首条消息的新任务）。
		 */
		function deriveRows(sessions, workspaces) {
			if (sessions.phase !== "ready" || workspaces.phase !== "ready") return null;
			const ws = workspaces.items.find((w) => w.title === DEFAULT_WORKSPACE_TITLE);
			if (ws === undefined) return [];
			const archived = new Set(workspaces.archivedSessionIds);
			const rows = [];
			for (const id of ws.sessionIds) {
				const s = sessions.byId[id];
				if (s === undefined) continue;
				if (s.origin === "subagent" || archived.has(s.id)) continue;
				if (s.blank && s.id !== sessions.current) continue;
				rows.push(s);
			}
			rows.sort((a, b) => (b.updatedAt !== a.updatedAt ? b.updatedAt - a.updatedAt : (a.id < b.id ? -1 : 1)));
			return rows;
		}

		/**
		 * 项目任务分组：每个非 default 工作区一组（{id, title, rows}），供普通
		 * 模式「显示项目任务」展开用。可见性与 deriveRows 同一套（排除子代理、
		 * 已归档、blank 只留当前那条）；组内按最近更新逆序，组间按组内最新活动
		 * 逆序（最近用过的项目排上面），没有可见会话的工作区整组不出现。
		 * 快照未就绪返回 null（与 deriveRows 同步出 loading 态）。
		 */
		function deriveProjectGroups(sessions, workspaces) {
			if (sessions.phase !== "ready" || workspaces.phase !== "ready") return null;
			const archived = new Set(workspaces.archivedSessionIds);
			const groups = [];
			for (const w of workspaces.items) {
				if (w.title === DEFAULT_WORKSPACE_TITLE) continue;
				const rows = [];
				for (const id of w.sessionIds) {
					const s = sessions.byId[id];
					if (s === undefined) continue;
					if (s.origin === "subagent" || archived.has(s.id)) continue;
					if (s.blank && s.id !== sessions.current) continue;
					rows.push(s);
				}
				if (rows.length === 0) continue;
				rows.sort((a, b) => (b.updatedAt !== a.updatedAt ? b.updatedAt - a.updatedAt : (a.id < b.id ? -1 : 1)));
				groups.push({ id: w.workspaceId, title: w.title, rows });
			}
			groups.sort((a, b) => (b.rows[0].updatedAt !== a.rows[0].updatedAt
				? b.rows[0].updatedAt - a.rows[0].updatedAt
				: (a.id < b.id ? -1 : 1)));
			return groups;
		}

		/**
		 * 搜索合并（规则对齐 dsh WorkspaceBrowser 的 deriveSearchResults）：本地
		 * 标题/工作区名子串匹配按最近更新倒序排前，Host 内容命中按后端相关性追加，
		 * 按会话去重后截到 limit；hasMore 提示「需要更具体的关键词」。可见性与
		 * deriveRows 一致（排除子代理、已归档、空白除当前），但搜索覆盖全部工作区，
		 * default 工作区的行不展示工作区名。content 为 null（尚未返回/无查询）时
		 * 只出本地行；快照未就绪时两者皆空（弹窗通常在加载完成后打开）。
		 */
		function deriveSearchRows(sessions, workspaces, query, content, limit) {
			const q = query.trim().toLowerCase();
			if (q === "" || sessions.phase !== "ready" || workspaces.phase !== "ready") {
				return { rows: [], hasMore: false };
			}
			const archived = new Set(workspaces.archivedSessionIds);
			const labelBySession = new Map();
			for (const w of workspaces.items) {
				if (w.title === DEFAULT_WORKSPACE_TITLE) continue;
				for (const id of w.sessionIds) if (!labelBySession.has(id)) labelBySession.set(id, w.title);
			}
			const local = [];
			for (const w of workspaces.items) {
				for (const id of w.sessionIds) {
					const s = sessions.byId[id];
					if (s === undefined) continue;
					if (s.origin === "subagent" || archived.has(s.id)) continue;
					if (s.blank && s.id !== sessions.current) continue;
					const label = labelBySession.get(s.id);
					if (String(s.displayTitle ?? "").toLowerCase().includes(q)
						|| (label !== undefined && label.toLowerCase().includes(q))) {
						local.push({ session: s, label });
					}
				}
			}
			local.sort((a, b) => (b.session.updatedAt !== a.session.updatedAt
				? b.session.updatedAt - a.session.updatedAt
				: (a.session.id < b.session.id ? -1 : 1)));
			const snippetBySession = new Map();
			if (content !== null) {
				for (const item of content.items) {
					if (!snippetBySession.has(item.sessionId)) snippetBySession.set(item.sessionId, item.snippet);
				}
			}
			const seen = new Set();
			const rows = [];
			const include = (session, label) => {
				if (seen.has(session.id)) return;
				seen.add(session.id);
				rows.push({ session, label, snippet: snippetBySession.get(session.id) });
			};
			for (const row of local) include(row.session, row.label);
			if (content !== null) {
				for (const item of content.items) {
					const s = sessions.byId[item.sessionId];
					if (s === undefined || s.blank || s.origin === "subagent" || archived.has(s.id)) continue;
					include(s, labelBySession.get(s.id));
				}
			}
			// 溢出提示不分来源：本地命中超限同样提示（内容搜索未返回/降级期间
			// 不能静默截断），后端 hasMore 亦透传。
			return { rows: rows.slice(0, limit), hasMore: (content !== null && content.hasMore) || rows.length > limit };
		}

		function relativeTime(timestamp, t) {
			const ms = Date.now() - timestamp;
			const minutes = Math.floor(ms / 60000);
			if (minutes < 1) return t("time.now");
			if (minutes < 60) return format(t("time.minutes"), { n: minutes });
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return format(t("time.hours"), { n: hours });
			const days = Math.floor(hours / 24);
			if (days < 30) return format(t("time.days"), { n: days });
			const months = Math.floor(days / 30);
			if (months < 12) return format(t("time.months"), { n: months });
			return format(t("time.years"), { n: Math.floor(months / 12) });
		}

		/**
		 * Finder 深链打开后的守位。dsh 的一次性启动恢复（ui-workspace 的
		 * restoreSelection）在 stores 就绪后才落定，且内部也要走一次会话创建
		 * （可能被偶发挂起拖到很晚）——它晚于我们的导航落地时，会把当前会话
		 * 改回「上次退出时选中」（通常是 default 的空白会话），后发导航胜，
		 * 表现为切到文件夹一闪后被翻回 default。fi 侧够不着它的内部，只能守位：
		 * 先等自己的切换真正落地（current 进入目标工作区；会话创建可能挂起，
		 * 落地前的快照抖动一律无视），落地后短窗内盯住快照——当前会话掉回
		 * default 空白（或消失）就重钉目标工作区。纠正带次数与期限上限，且只认
		 * 「default 空白」这一种掉回形态，用户停在真实会话上不打扰（恢复只跑
		 * 一次，两次纠正足够）。返回取消函数（重复投递时旧守位先撤）。
		 * opts.now/setTimeout/windowMs/maxCorrections 可注入（单测）。
		 */
		function guardFinderOpen(deps, ws, options) {
			const opts = options ?? {}
			const now = opts.now ?? Date.now
			const schedule = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
			const windowMs = opts.windowMs ?? 10_000
			const maxCorrections = opts.maxCorrections ?? 3
			const outerCapMs = opts.outerCapMs ?? 60_000
			let corrections = 0
			let landed = false
			let deadline = Infinity
			const born = now()
			const correct = () => {
				// 优先绕开 uiWorkspace.connectWorkspace 的 inflight 表：投递重试场景里
				// 挂起的旧建会话承诺还占着表项，startSession 的纠正会被同一张表吸住
				// （拿到同一个挂死 Promise）。直接走 sessions.create 发全新 RPC，
				// 成功后 openSession 直达 replaceMain；面不可用/失败再回退 startSession。
				if (typeof deps.sessions.create === 'function') {
					Promise.resolve()
						.then(() => deps.sessions.create({ workspaceId: ws.workspaceId }))
						.then((result) => {
							if (result?.ok === true && result.value?.sessionId !== undefined) {
								deps.uiWorkspace.openSession(result.value.sessionId)
							} else {
								deps.uiWorkspace.startSession(ws.workspaceId)
							}
						})
						.catch(() => { deps.uiWorkspace.startSession(ws.workspaceId) })
				} else {
					deps.uiWorkspace.startSession(ws.workspaceId)
				}
			}
			const check = () => {
				if (now() - born > outerCapMs) return
				const wsList = deps.workspaces.list.getSnapshot()
				const sl = deps.sessions.list.getSnapshot()
				const current = sl.current
				const live = wsList.items.find((w) => w.workspaceId === ws.workspaceId)
				const inTarget = current !== undefined && live !== undefined && live.sessionIds.includes(current)
				if (!landed) {
					// 落地判定（不含纠正窗口计时）；落地前的 default 空白是自有导航
					// 未完成的正常中间态，无视，避免烧掉纠正额度。
					if (inTarget) {
						landed = true
						deadline = now() + windowMs
					}
					return
				}
				if (corrections >= maxCorrections || now() > deadline) return
				if (inTarget) return
				if (current !== undefined) {
					const home = wsList.items.find((w) => w.sessionIds.includes(current))
					if (home === undefined || home.title !== DEFAULT_WORKSPACE_TITLE || sl.byId[current]?.blank !== true) return
				}
				corrections += 1
				correct()
			};
			const disposeWorkspaces = deps.workspaces.list.subscribe(check)
			const disposeSessions = deps.sessions.list.subscribe(check)
			check()
			schedule(check, opts.settleMs ?? 400)
			const stop = () => { disposeWorkspaces(); disposeSessions() }
			schedule(stop, outerCapMs + 500)
			return stop
		}
		//#endregion

		//#region components
function ActionButton({ label, icon: iconName, onClick, pressed, current }) {
	return jsx.jsx("button", {
		type: "button",
		className: "fi-action",
		"aria-label": label,
		"aria-pressed": pressed === undefined ? undefined : pressed ? "true" : "false",
		"aria-current": current ? "page" : undefined,
		onClick,
		children: [icon(iconName, 18), jsx.jsx("span", { children: label })],
	});
}

		function SessionRow({ session, selected, pending, onOpen, t }) {
			const title = session.blank ? t("session.new") : String(session.displayTitle ?? "");
			return jsx.jsxs("button", {
				type: "button",
				className: "fi-row",
				"data-selected": selected ? "true" : undefined,
				"aria-label": format(t("row.open.aria"), { name: title }),
				onClick: () => onOpen(session.id),
				children: [
					pending
						? jsx.jsx("span", { className: "fi-dot fi-dot--pending", "aria-hidden": "true" })
						: session.running
							? jsx.jsx("span", { className: "fi-dot fi-dot--running", "aria-hidden": "true" })
							: null,
					jsx.jsx("span", { className: "fi-row-title", children: title }),
					session.blank ? null : jsx.jsx("span", { className: "fi-row-time", children: relativeTime(session.updatedAt, t) }),
				],
			});
		}

		/**
		 * 项目模式入口按钮：渲染进 dsh 侧栏 logo 行（收起按钮左侧）。
		 * 文件夹图标呼应侧栏的项目分组语义；激活（项目模式开启）时换打开的文件夹。
		 */
		function ProjectModeToggle({ active, onToggle, t }) {
			return jsx.jsx(primitives.Tooltip, {
				label: t("mode.project"),
				side: "bottom",
				delayMs: 500,
				children: jsx.jsx("button", {
					type: "button",
					className: "fi-ws-toggle",
					"aria-label": t("mode.project"),
					"aria-pressed": active ? "true" : "false",
					onClick: onToggle,
					children: icon(active ? ICONS.projectOn : ICONS.projectOff, 16),
				}),
			});
		}

		/**
		 * 项目模式入口容器在 logo 行内的定位规则：紧贴 dsh 自有子元素的最后
		 * 一个（收起按钮）之前。展开侧栏时 React 只认自己的节点，重挂品牌按钮
		 * 会 insertBefore 到收起按钮上，把外来容器顶到品牌（小鱼图标）前面
		 * ——所以每次对账都要重算锚点并回位，不能只在首次挂载时定位。
		 */
		function placeToggleHost(row, node) {
			// 锚点 = 行内最后一个非临时子元素。dsh Tooltip 的气泡 span（role=tooltip）
			// 悬浮 500ms 后会内联挂进行尾、移开即摘除：把它当锚点会把入口搬过收起按钮，
			// 按钮跳位会把光标下的元素换成入口（悬浮错位、弹错气泡），气泡随布局
			// 振荡还会吞掉 mouseleave 使气泡卡死不消失——所以锚点必须跳过它。
			let anchor = row.lastElementChild;
			while (anchor !== null && (anchor === node || anchor.getAttribute("role") === "tooltip")) {
				anchor = anchor.previousElementSibling;
			}
			if (node.parentElement !== row || node.nextElementSibling !== anchor) {
				if (anchor !== null) row.insertBefore(node, anchor);
				else row.appendChild(node);
			}
		}

		/**
		 * 把项目模式入口挂进 dsh 原生 logo 行。logo 行没有对外 slot，只能注入
		 * 宿主 DOM：在收起按钮前插入容器，经 React portal 渲染按钮（状态仍归
		 * FiSidebarRegion 管）。React 重渲染可能移除外来节点，观察器负责把同一
		 * 容器插回（portal 不需要重建），并经 placeToggleHost 校正顺序。
		 */
		function useLogoRowToggleHost() {
			const [host, setHost] = react.useState(null);
			const hostRef = react.useRef(null);
			react.useEffect(() => {
				const reconcile = () => {
					const row = document.querySelector('[class*="_logoRow"]');
					if (row === null) return;
					let node = hostRef.current;
					if (node === null || !node.isConnected) {
						node = row.querySelector(":scope > .fi-ws-toggle-host") ?? document.createElement("div");
						node.className = "fi-ws-toggle-host";
					}
					placeToggleHost(row, node);
					if (hostRef.current !== node) {
						hostRef.current = node;
						setHost(node);
					}
				};
				reconcile();
				const observer = new MutationObserver(reconcile);
				observer.observe(document.documentElement, { childList: true, subtree: true });
				return () => {
					observer.disconnect();
					hostRef.current = null;
					setHost(null);
				};
			}, []);
			return host;
		}

		/** 标题里第一处命中（大小写不敏感）加亮，对齐 ZCode 的命中标记样式。 */
		function HighlightedText({ text, query }) {
			const q = query.trim();
			if (q === "") return text;
			const index = text.toLowerCase().indexOf(q.toLowerCase());
			if (index < 0) return text;
			return jsx.jsxs(jsx.Fragment, { children: [
				text.slice(0, index),
				jsx.jsx("mark", { className: "fi-search-mark", children: text.slice(index, index + q.length) }),
				text.slice(index + q.length),
			] });
		}

		/**
		 * 搜索结果/最近会话行。hover 与键盘导航共用 data-active 高亮（ZCode 惯例），
		 * 选中态变化时把行滚进可视区；内容命中在标题下追加一行摘要。
		 */
		function SearchRow({ row, query, active, onActivate, onPick, t }) {
			const ref = react.useRef(null);
			react.useEffect(() => {
				if (active && ref.current !== null) ref.current.scrollIntoView({ block: "nearest" });
			}, [active]);
			const s = row.session;
			const title = s.blank ? t("session.new") : String(s.displayTitle ?? "");
			return jsx.jsxs("button", {
				ref,
				type: "button",
				className: "fi-search-row",
				"data-active": active ? "true" : undefined,
				"aria-label": format(t("row.open.aria"), { name: title }),
				onMouseEnter: onActivate,
				onClick: onPick,
				children: [
					jsx.jsxs("span", { className: "fi-search-row-head", children: [
						s.running ? jsx.jsx("span", { className: "fi-dot fi-dot--running", "aria-hidden": "true" }) : null,
						jsx.jsx("span", { className: "fi-search-row-title", children:
							jsx.jsx(HighlightedText, { text: title, query }) }),
						jsx.jsxs("span", { className: "fi-search-row-meta", children: [
							row.label !== undefined ? jsx.jsx("span", { className: "fi-search-row-ws", children: row.label }) : null,
							s.blank ? null : relativeTime(s.updatedAt, t),
						] }),
					] }),
					row.snippet === undefined ? null : jsx.jsx("span", { className: "fi-search-snippet", children: row.snippet }),
				],
			});
		}

		/**
		 * 搜索弹窗（ZCode Command Center 的会话版）：全屏模糊遮罩 + 顶部居中面板。
		 * 空查询列最近会话；输入后 250ms 防抖调 Host 内容搜索，与本地合并展示。
		 * AbortController + 卸载/重发时中止，竞态按「最新请求胜出」处理。
		 * 键盘 ↑/↓ 循环、Enter 打开、Esc/点遮罩关闭；输入法组合态不拦截按键。
		 */
		function SearchDialog({ open, recentRows, sessions, workspaces, searchSessions, searchResultLimit, onOpenSession, onClose, t }) {
			const [query, setQuery] = react.useState("");
			const [content, setContent] = react.useState(null);
			const [searching, setSearching] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [activeIndex, setActiveIndex] = react.useState(0);
			const inputRef = react.useRef(null);
			const trimmed = query.trim();

			// 每次打开复位瞬态状态（对齐 ZCode：关闭即清空，下次进入是干净面板）
			react.useEffect(() => {
				if (open) {
					setQuery("");
					setContent(null);
					setSearching(false);
					setError(null);
					setActiveIndex(0);
					if (inputRef.current !== null) inputRef.current.focus();
				}
			}, [open]);

			react.useEffect(() => {
				if (!open) return undefined;
				const q = trimmed;
				if (q === "") {
					setContent(null);
					setSearching(false);
					setError(null);
					return undefined;
				}
				const controller = new AbortController();
				setSearching(true);
				const timer = window.setTimeout(() => {
					searchSessions(q, controller.signal).then((result) => {
						if (controller.signal.aborted) return;
						setContent(result);
						setSearching(false);
						setError(null);
					}).catch((err) => {
						if (controller.signal.aborted) return;
						setContent(null);
						setSearching(false);
						setError(err instanceof Error ? err.message : String(err));
					});
				}, SEARCH_DEBOUNCE_MS);
				return () => {
					window.clearTimeout(timer);
					controller.abort();
				};
			}, [open, trimmed, searchSessions]);

			const displayRows = react.useMemo(() => (trimmed === ""
				? recentRows.slice(0, SEARCH_RECENT_LIMIT).map((session) => ({ session, label: undefined, snippet: undefined }))
				: deriveSearchRows(sessions, workspaces, trimmed, content, searchResultLimit).rows),
			[trimmed, recentRows, sessions, workspaces, content, searchResultLimit]);
			const hasMore = trimmed !== ""
				&& deriveSearchRows(sessions, workspaces, trimmed, content, searchResultLimit).hasMore;

			// 结果集变化时把选中项收回范围内（不减位：新查询由打开/输入复位到 0）
			react.useEffect(() => {
				setActiveIndex((index) => Math.min(index, Math.max(0, displayRows.length - 1)));
			}, [displayRows.length]);

			if (!open) return null;

			const onKeyDown = (event) => {
				if (event.isComposing) return;
				if (event.key === "Escape") {
					event.stopPropagation();
					onClose();
					return;
				}
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					if (displayRows.length === 0) return;
					const delta = event.key === "ArrowDown" ? 1 : -1;
					setActiveIndex((index) => (index + delta + displayRows.length) % displayRows.length);
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					const row = displayRows[activeIndex];
					if (row !== undefined) {
						onOpenSession(row.session.id);
						onClose();
					}
				}
			};

			const body = displayRows.length === 0
				? jsx.jsx("div", { className: "fi-search-note", title: error ?? undefined, children:
					error !== null ? t("search.unavailable")
						: trimmed !== "" ? (searching ? t("search.searching") : t("search.empty"))
							: t("empty.none") })
				: jsx.jsxs(react.Fragment, { children: [
					trimmed === "" ? jsx.jsx("div", { className: "fi-search-label", children: t("search.recent") }) : null,
					displayRows.map((row, index) => jsx.jsx(SearchRow, {
						row,
						query: trimmed,
						active: index === activeIndex,
						onActivate: () => setActiveIndex(index),
						onPick: () => {
							onOpenSession(row.session.id);
							onClose();
						},
						t,
					}, row.session.id)),
					error !== null ? jsx.jsx("div", { className: "fi-search-more", title: error, children: t("search.unavailable") }) : null,
					hasMore ? jsx.jsx("div", { className: "fi-search-more", children: t("search.more") }) : null,
				] });

			return reactDom.createPortal(
				jsx.jsx("div", {
					className: "fi-search-backdrop",
					onKeyDown,
					onClick: (event) => {
						if (event.target === event.currentTarget) onClose();
					},
					children: jsx.jsx("div", { className: "fi-search-panel", role: "dialog", "aria-modal": "true",
						"aria-label": t("search"), children: [
							jsx.jsxs("div", { className: "fi-search-field", children: [
								icon(ICONS.search, 16),
								jsx.jsx("input", {
									ref: inputRef,
									className: "fi-search-input",
									value: query,
									maxLength: SEARCH_QUERY_MAX,
									placeholder: t("search.placeholder"),
									"aria-label": t("search"),
									spellCheck: false,
									onChange: (event) => {
										setQuery(event.target.value);
										setActiveIndex(0);
									},
								}),
							] }),
							jsx.jsx("div", { className: "fi-search-list", children: body }),
						] }),
				}),
				document.body,
			);
		}

		/**
		 * fi 侧栏主体。以 priority -1 影子接管 dsh 的 sidebar.workspaces 槽位
		 * （single 槽位取 priority 最低的注册者，同 priority 才冲突）。
		 * 普通模式即默认视图（按钮列 + 任务列表）；项目模式入口在右上角 logo
		 * 行，开启后整个区域切换为文件浏览器（Finder 式逐层进入），再点恢复。
		 * 「搜索」按钮与 ⌘K/Ctrl+K 唤起居中搜索弹窗（SearchDialog，portal 到
		 * body，两种模式与折叠态下都可用）。useSessions / useWorkspaces /
		 * usePanelInfo / useSessionPendingInteraction 是槽位宿主通过 provideRoot
		 * 下发的全局 hook；t 绑定本注册的 fiSidebar 词典。
		 */
		function FiSidebarRegion({ wide, expandSidebar, startNewTask, startNewTaskIn, openSession, searchSessions, searchResultLimit, useSessions, useWorkspaces, usePanelInfo, useSessionPendingInteraction, quoteProbe, t }) {
			const [mode, setMode] = react.useState(() => {
				try {
					return window.localStorage.getItem(MODE_STORAGE_KEY) === "project" ? "project" : "normal";
				} catch {
					return "normal";
				}
			});
			const switchMode = (next) => {
				setMode(next);
				try {
					window.localStorage.setItem(MODE_STORAGE_KEY, next);
				} catch { /* 存储不可用时仅退化为不记忆 */ }
			};
			const toggleHost = useLogoRowToggleHost();

			const [searchOpen, setSearchOpen] = react.useState(false);
			// 右侧整页面板（0.5 定时任务、0.7 插件中心）：null 或面板名，单状态
			// 天然互斥；任何会话被打开或新建任务时关闭（右侧回到对应页面，
			// 等价于退出面板）。
			const [page, setPage] = react.useState(null);
			const closePage = react.useCallback(() => setPage(null), []);

			const sessions = useSessions((s) => s);
			const workspaces = useWorkspaces((s) => s);
			const panelActive = usePanelInfo((info) => info.activePanelId !== null);
			const pending = useSessionPendingInteraction((s) => s);

			// 「显示项目任务」：默认隐藏（任务清单只看 default），选择持久在
			// localStorage；展开后 default 行照旧，下面按项目工作区分组追加。
			const [showProjects, setShowProjects] = react.useState(readShowProjects);
			const toggleProjects = () => {
				setShowProjects((prev) => {
					const next = !prev;
					writeShowProjects(next);
					return next;
				});
			};

			const rows = react.useMemo(() => deriveRows(sessions, workspaces), [sessions, workspaces]);
			const projectGroups = react.useMemo(() => deriveProjectGroups(sessions, workspaces), [sessions, workspaces]);
			const currentId = panelActive ? undefined : sessions.current;
			// 「新建任务」按钮常驻高亮（aria-current=page）：右侧停在新任务页
			// （当前会话是未发送首条消息的 blank）时亮起，与面板按钮打开时的
			// 常驻样式一致；任一整页面板开着或切到已有任务时熄灭——页面级
			// 高亮互斥。blank 判定与 boot pin 同款（byId[current]?.blank）。
			const onNewTaskPage = page === null && (sessions.byId[currentId]?.blank ?? false);

			// 会话被打开（新建/搜索/列表点击/定时任务跳转）→ 右侧换页，面板随之关闭。
			react.useEffect(() => {
				setPage(null);
			}, [currentId]);

			const openSessionAndClose = react.useCallback((sessionId) => {
				closePage();
				openSession(sessionId);
			}, [closePage, openSession]);

			// ⌘K / Ctrl+K 全局唤起（ZCode 惯例）：过滤输入法组合态与长按重复，
			// Apple 平台认 ⌘、其余认 Ctrl，修饰键须精确匹配。
			react.useEffect(() => {
				const onKey = (event) => {
					if (event.isComposing || event.repeat) return;
					const apple = /Mac|iPhone|iPad/.test(navigator.platform);
					if (event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey) return;
					if (apple ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return;
					event.preventDefault();
					setSearchOpen((open) => !open);
				};
				document.addEventListener("keydown", onKey);
				return () => document.removeEventListener("keydown", onKey);
			}, []);

			// portal 到 body，不随侧栏宽窄/模式切换卸载；折叠态下也能 ⌘K 唤起。
			const searchDialog = jsx.jsx(SearchDialog, {
				open: searchOpen,
				recentRows: rows ?? [],
				sessions,
				workspaces,
				searchSessions,
				searchResultLimit,
				onOpenSession: openSessionAndClose,
				onClose: () => setSearchOpen(false),
				t,
			});

			const cronPanel = jsx.jsx(CronPanel, {
				open: page === "cron",
				onClose: closePage,
				openSession: openSessionAndClose,
				t,
			});

			const pluginPanel = jsx.jsx(PluginCenterPanel, {
				open: page === "plugins",
				onClose: closePage,
				t,
			});

			// 选区引用：右面板占用时无对话页，不监听；probe 由 apply 注入（探测
			// sendSession 补丁）。portal 到 body，折叠 rail 下同样可用。
			const probe = react.useCallback(() => (typeof quoteProbe === "function" ? quoteProbe() : false), [quoteProbe]);
			const addQuote = react.useCallback((snap) => {
				const sessionId = sessions.current;
				if (typeof sessionId !== "string" || snap.text === null || snap.kind === null) return;
				quoteStore.add(sessionId, makeQuote(
					snap.text,
					snap.kind,
					format(t("quote.source"), { kind: t(`quote.kind.${snap.kind}`) }),
				));
			}, [sessions, t]);
			const quoteTooltip = jsx.jsx(QuoteSelectionTooltip, {
				enabled: !panelActive && sessions.current !== undefined,
				probe,
				onAdd: addQuote,
				t,
			});

			if (!wide) {
				// 折叠 rail：只留搜索入口，点按展开侧栏（对齐 dsh 原 rail 行为）。
				return jsx.jsxs("div", {
					className: "fi-region fi-region--rail",
					children: [
						jsx.jsx("button", {
							type: "button",
							className: "fi-action",
							"aria-label": t("search"),
							onClick: () => expandSidebar?.(),
							children: icon(ICONS.search, 18),
						}),
						searchDialog,
						cronPanel,
						pluginPanel,
						quoteTooltip,
					],
				});
			}

			return jsx.jsxs("div", { className: "fi-region", children: [
				// 项目模式入口：portal 进 dsh 原生 logo 行（收起按钮左侧）
				toggleHost !== null
					? reactDom.createPortal(
						jsx.jsx(ProjectModeToggle, {
							active: mode === "project",
							onToggle: () => {
								closePage();
								switchMode(mode === "project" ? "normal" : "project");
							},
							t,
						}),
						toggleHost,
					)
					: null,
					// 选区引用 tooltip 两种模式都要挂（项目模式下对话页仍然可见）
					quoteTooltip,
				// 项目模式：logo 行以下整体切换为文件浏览器；普通模式：按钮列 + 任务列表
				mode === "project"
					? jsx.jsx(FileBrowser, { startNewTaskIn, t })
					: jsx.jsxs(react.Fragment, { children: [
						jsx.jsxs("div", { className: "fi-actions", children: [
							jsx.jsx(ActionButton, { label: t("newTask"), icon: ICONS.newTask, current: onNewTaskPage, onClick: () => {
								closePage();
								startNewTask();
							} }),
							jsx.jsx(ActionButton, { label: t("search"), icon: ICONS.search, onClick: () => setSearchOpen(true) }),
							jsx.jsx(ActionButton, { label: t("schedule"), icon: ICONS.schedule, pressed: page === "cron", onClick: () => setPage((value) => (value === "cron" ? null : "cron")) }),
							jsx.jsx(ActionButton, { label: t("plugins"), icon: ICONS.plugins, pressed: page === "plugins", onClick: () => setPage((value) => (value === "plugins" ? null : "plugins")) }),
						] }),
					jsx.jsxs("div", { className: "fi-section", children: [
						jsx.jsx("span", { className: "fi-section-label", children: t("section.tasks") }),
						// 项目任务显隐开关：关=folder-dot（默认），开=folder-open-dot；
						// 28px 按钮/16px 图标与 logo 行收起按钮同规格，垂直对齐同一条线
						jsx.jsx("button", {
							type: "button",
							className: "fi-section-toggle",
							"aria-label": t("section.toggleProjects"),
							title: t("section.toggleProjects"),
							"aria-pressed": showProjects ? "true" : "false",
							onClick: toggleProjects,
							children: icon(showProjects ? ICONS.projectsOn : ICONS.projectsOff, 16),
						}),
					] }),
					jsx.jsx("div", { className: "fi-list", children:
						rows === null || (showProjects && projectGroups === null)
							? jsx.jsx("div", { className: "fi-loading", children: t("empty.loading") })
							: rows.length === 0 && (!showProjects || projectGroups.length === 0)
								? jsx.jsx("div", { className: "fi-empty", children: t("empty.none") })
								: jsx.jsxs(react.Fragment, { children: [
									rows.map((s) => jsx.jsx(SessionRow, {
										session: s,
										selected: s.id === currentId,
										pending: typeof pending?.get === "function" && pending.get(s.id) !== undefined,
										onOpen: openSessionAndClose,
										t,
									}, s.id)),
									showProjects ? projectGroups.flatMap((group) => [
										jsx.jsxs("div", { className: "fi-group", children: [
											jsx.jsx("span", { className: "fi-group-icon", children: icon(ICONS.folderRow, 14) }),
											jsx.jsx("span", { className: "fi-group-title", children: group.title }),
										] }, `group:${group.id}`),
										...group.rows.map((s) => jsx.jsx(SessionRow, {
											session: s,
											selected: s.id === currentId,
											pending: typeof pending?.get === "function" && pending.get(s.id) !== undefined,
											onOpen: openSessionAndClose,
											t,
										}, s.id)),
									]) : null,
									showProjects && projectGroups.length === 0 && rows.length > 0
										? jsx.jsx("div", { className: "fi-empty", children: t("empty.projects") })
										: null,
								] }),
					}),
				] }),
				searchDialog,
				cronPanel,
				pluginPanel,
			] });
		}
		//#endregion

		//#region file browser
		/**
		 * Electron 桥（src/preload + src/main/fs-bridge.ts）。preload 先于页面
		 * 脚本运行，模块加载时即已就位；缺失说明当前不在 fi 桌面壳里（如浏览器
		 * 直接开 dsh 网页），文件浏览器退化为提示行。
		 */
		const FI_FS = typeof window !== "undefined" ? window.fi?.fs ?? null : null;
		const FI_SHELL = typeof window !== "undefined" ? window.fi?.shell ?? null : null;
		const FI_CLIPBOARD = typeof window !== "undefined" ? window.fi?.clipboard ?? null : null;

		/** 项目模式浏览位置在本次运行内记忆：退出项目模式再进入保持原地，重启即复位。 */
		let savedStack = null;

		/**
		 * 隐藏项显隐选择持久在 localStorage，跨重启生效（与只记本次运行的位置
		 * 不同）。键缺省 = 不展示隐藏项（未动过开关时的默认）；用户点过开关后
		 * 以存储的选择为准。
		 */
		const HIDDEN_STORAGE_KEY = "fi.sidebar.showHidden";
		function readShowHidden() {
			try {
				return window.localStorage.getItem(HIDDEN_STORAGE_KEY) === "1";
			} catch {
				return false;
			}
		}
		function writeShowHidden(value) {
			try {
				window.localStorage.setItem(HIDDEN_STORAGE_KEY, value ? "1" : "0");
			} catch { /* 存储不可用时仅退化为不记忆 */ }
		}

		const pathTail = (path) => {
			const parts = path.split("/");
			return parts[parts.length - 1] || path;
		};

		function levelNote(level, t) {
			if (level.phase === "loading") return t("fb.loading");
			if (level.code === "ENOENT") return t("fb.notFound");
			if (level.code === "EPERM" || level.code === "EACCES") return t("fb.denied");
			if (level.code === "ENOTDIR") return t("fb.notDirectory");
			return format(t("fb.errorOther"), { msg: level.message || level.code });
		}

		/** 路径条：栈上每一级一个可点面包屑（首级即主目录，显示 ~），自动滚到末尾。 */
		function FbCrumbs({ stack, onJump }) {
			const ref = react.useRef(null);
			react.useEffect(() => {
				const el = ref.current;
				if (el !== null) el.scrollLeft = el.scrollWidth;
			}, [stack]);
			return jsx.jsx("div", { className: "fi-fb-crumbs", ref, children: stack.map((path, index) =>
				jsx.jsxs(react.Fragment, { children: [
					index > 0 ? jsx.jsx("span", { className: "fi-fb-sep", children: "/" }) : null,
					jsx.jsx("button", {
						type: "button",
						className: "fi-fb-crumb",
						"aria-current": index === stack.length - 1 ? "true" : undefined,
						onClick: () => onJump(index),
						children: index === 0 ? "~" : pathTail(path),
					}),
				] }, path)) });
		}

		/**
		 * 单行条目。目录：单击进入，行尾「新建任务」按钮在该文件夹里新建会话；
		 * 文件：单击用系统默认程序打开。双击（detail>1）忽略，防连点误入子目录。
		 * 断链等 other 条目灰显不可点（与 dsh 目录浏览一致）。
		 * 行容器是 div role=button（HTML 不允许 button 内嵌交互元素），行内
		 * 「新建任务」是真正的 button；键盘激活只认行自身聚焦时（事件目标
		 * 是内部按钮则交给按钮的默认行为），与 CronRow 同一模式。
		 */
		function FbRow({ entry, creating, onEnter, onOpen, onNewTask, onMenu, t }) {
			if (entry.type === "other") {
				return jsx.jsx("div", { className: "fi-fb-row fi-fb-row--other", children:
					jsx.jsx("span", { className: "fi-fb-row-name", children: entry.name }) });
			}
			const isDir = entry.type === "directory";
			const hidden = entry.name.startsWith(".");
			const activate = () => (isDir ? onEnter(entry) : onOpen(entry));
			return jsx.jsxs("div", {
				className: hidden ? "fi-fb-row fi-fb-row--hidden" : "fi-fb-row",
				role: "button",
				tabIndex: 0,
				onClick: (event) => {
					if (event.detail > 1) return;
					activate();
				},
				onKeyDown: (event) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					activate();
				},
				onContextMenu: (event) => onMenu(event, entry),
				children: [
					jsx.jsx("span", { className: "fi-fb-row-icon", children:
						isDir ? icon(ICONS.folderRow, 16) : null }),
					jsx.jsx("span", { className: "fi-fb-row-name", children: entry.name }),
					isDir ? jsx.jsx("button", {
						type: "button",
						className: "fi-fb-new",
						"aria-label": t("row.newTaskHere"),
						title: t("row.newTaskHere"),
						onClick: (event) => {
							event.stopPropagation();
							onNewTask(entry);
						},
						// 气泡+加号（Lucide message-circle-plus）：对齐 ZCode 的新建任务
						// 图标，避免裸加号在文件列表里被误读为「新建文件」。
						children: icon(ICONS.newTaskHere, 14),
					}) : null,
				],
			});
		}

		/** 右键菜单。点菜单外/Escape/窗口缩放关闭；点在菜单内不关。 */
		function FbMenu({ x, y, entry, onCopy, onReveal, onOpen, onClose, t }) {
			react.useEffect(() => {
				const onDocClick = (event) => {
					if (event.target instanceof Element && event.target.closest(".fi-fb-menu")) return;
					onClose();
				};
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("click", onDocClick, true);
				window.addEventListener("resize", onClose);
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("click", onDocClick, true);
					window.removeEventListener("resize", onClose);
					window.removeEventListener("keydown", onKey);
				};
			}, [onClose]);
			const items = [
				{ label: t("fb.copyPath"), iconName: ICONS.copyPath, act: onCopy },
				{ label: t("fb.reveal"), iconName: ICONS.reveal, act: onReveal },
				{ label: t("fb.open"), iconName: ICONS.open, act: onOpen },
			];
			const style = {
				left: Math.max(4, Math.min(x, window.innerWidth - 188)),
				top: Math.max(4, Math.min(y, window.innerHeight - items.length * 34 - 12)),
			};
			return jsx.jsx("div", { className: "fi-fb-menu", style, children: items.map((item) =>
				jsx.jsx("button", {
					type: "button",
					className: "fi-fb-menu-item",
					onClick: () => item.act(entry),
					children: [icon(item.iconName, 14), item.label],
				}, item.label)) });
		}

		/**
		 * 项目模式主体：Finder 式逐层进入的文件浏览器。层级栈（stack）既是导航
		 * 状态也是路径条数据；每层内容按路径缓存，返回上级即时呈现，刷新按钮
		 * 强制重读当前层。位置在 savedStack 里跨项目模式开关保持。
		 */
		function FileBrowser({ startNewTaskIn, t }) {
			const [stack, setStack] = react.useState(savedStack);
			const [showHidden, setShowHidden] = react.useState(readShowHidden);
			const [levels, setLevels] = react.useState({});
			const [menu, setMenu] = react.useState(null);
			const [status, setStatus] = react.useState(null);
			const [creating, setCreating] = react.useState(false);
			const statusTimer = react.useRef(undefined);

			const toggleHidden = () => {
				setShowHidden((prev) => {
					const next = !prev;
					writeShowHidden(next);
					return next;
				});
			};

			const current = stack === null ? null : stack[stack.length - 1];
			const level = current === null ? undefined : levels[current];

			// 不在 fi 桌面壳里：没有文件桥，退化为提示行（dsh 网页版直接打开时）。
			if (FI_FS === null) {
				return jsx.jsx("div", { className: "fi-fb", children:
					jsx.jsx("div", { className: "fi-fb-note", children: t("fb.desktopOnly") }) });
			}

			react.useEffect(() => {
				if (stack === null) {
					if (FI_FS === null) return;
					let gone = false;
					FI_FS.home().then((r) => {
						if (!gone && r?.ok === true) setStack([r.path]);
					}).catch(() => {});
					return () => { gone = true; };
				}
				savedStack = stack;
			}, [stack]);

			const loadLevel = react.useCallback((path) => {
				setLevels((prev) => ({ ...prev, [path]: { phase: "loading" } }));
				FI_FS.readdir(path).then((r) => {
					setLevels((prev) => ({ ...prev, [path]: r?.ok === true
						? { phase: "ready", entries: r.entries, truncated: r.truncated }
						: { phase: "failed", code: r?.code ?? "unknown", message: r?.message ?? "" } }));
				}).catch((err) => {
					setLevels((prev) => ({ ...prev, [path]: { phase: "failed", code: "unknown", message: String(err) } }));
				});
			}, []);

			react.useEffect(() => {
				if (current !== null && levels[current] === undefined) loadLevel(current);
			}, [current, levels, loadLevel]);

			const showStatus = (text) => {
				setStatus(text);
				if (statusTimer.current !== undefined) window.clearTimeout(statusTimer.current);
				statusTimer.current = window.setTimeout(() => setStatus(null), 2500);
			};

			const enter = (entry) => setStack((prev) => [...prev, entry.path]);
			const jump = (index) => setStack((prev) => prev.slice(0, index + 1));
			const goUp = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
			const refresh = () => {
				if (current !== null) loadLevel(current);
			};

			const openFile = (entry) => {
				FI_SHELL?.open(entry.path).then((r) => {
					if (r?.ok !== true) showStatus(format(t("fb.openFailed"), { msg: r?.message ?? "" }));
				}).catch(() => {});
			};
			const newTask = (entry) => {
				if (creating) return;
				setCreating(true);
				Promise.resolve(startNewTaskIn(entry.path)).then((err) => {
					setCreating(false);
					if (err) showStatus(format(t("fb.taskFailed"), { msg: err }));
				});
			};

			let body;
			if (level === undefined || level.phase === "loading") {
				body = jsx.jsx("div", { className: "fi-fb-note", children: t("fb.loading") });
			} else if (level.phase === "failed") {
				body = jsx.jsx("div", { className: "fi-fb-note", children: levelNote(level, t) });
			} else {
				// 隐藏项开关只影响展示，不动缓存：关掉后再打开无需重读目录。
				const entries = showHidden
					? level.entries
					: level.entries.filter((entry) => !entry.name.startsWith("."));
				body = entries.length === 0
					? jsx.jsx("div", { className: "fi-fb-note", children: t("fb.emptyDir") })
					: jsx.jsxs(react.Fragment, { children: [
						entries.map((entry) => jsx.jsx(FbRow, {
							entry,
							onEnter: enter,
							onOpen: openFile,
							onNewTask: newTask,
							onMenu: (event, row) => {
								event.preventDefault();
								setMenu({ x: event.clientX, y: event.clientY, entry: row });
							},
							t,
						}, entry.path)),
						level.truncated
							? jsx.jsx("div", { className: "fi-fb-note", children:
								format(t("fb.truncated"), { n: entries.length }) })
							: null,
					] });
			}

			return jsx.jsxs("div", { className: "fi-fb", children: [
				jsx.jsxs("div", { className: "fi-fb-bar", children: [
					jsx.jsx("button", {
						type: "button",
						className: "fi-fb-nav",
						"aria-label": t("fb.back"),
						title: t("fb.back"),
						disabled: stack === null || stack.length <= 1,
						onClick: goUp,
						children: icon(ICONS.back, 14),
					}),
					stack === null ? null : jsx.jsx(FbCrumbs, { stack, onJump: jump }),
					// 隐藏项显隐开关：睁眼=展示隐藏项，闭眼=隐藏（未动过开关时默认隐藏）
					jsx.jsx("button", {
						type: "button",
						className: "fi-fb-nav",
						"aria-label": t("fb.toggleHidden"),
						title: t("fb.toggleHidden"),
						"aria-pressed": showHidden ? "true" : "false",
						onClick: toggleHidden,
						children: icon(showHidden ? ICONS.eye : ICONS.eyeClosed, 14),
					}),
					jsx.jsx("button", {
						type: "button",
						className: "fi-fb-nav",
						"aria-label": t("fb.refresh"),
						title: t("fb.refresh"),
						disabled: current === null,
						onClick: refresh,
						children: icon(ICONS.refresh, 14),
					}),
				] }),
				status !== null ? jsx.jsx("div", { className: "fi-fb-status", children: status }) : null,
				jsx.jsx("div", { className: "fi-fb-list", children: body }),
				menu !== null ? jsx.jsx(FbMenu, {
					x: menu.x,
					y: menu.y,
					entry: menu.entry,
					onCopy: (row) => {
						// 复制成功不提示（系统惯例）；失败也静默——写剪贴板基本不会失败。
						FI_CLIPBOARD?.write(row.path)?.catch?.(() => {});
						setMenu(null);
					},
					onReveal: (row) => {
						FI_SHELL?.showInFolder(row.path)?.catch?.(() => {});
						setMenu(null);
					},
					onOpen: (row) => {
						openFile(row);
						setMenu(null);
					},
					onClose: () => setMenu(null),
					t,
				}) : null,
			] });
		}
		//#endregion

		//#region cron panel
		/**
		 * Electron 定时任务桥（src/main/cron.ts + preload window.fi.cron）。
		 * 缺失说明当前不在 fi 桌面壳里（浏览器直接开 dsh 网页），面板退化为提示行。
		 */
		const FI_CRON = typeof window !== "undefined" ? window.fi?.cron ?? null : null;

		const pad2 = (value) => String(value).padStart(2, "0");
		const CRON_FILTERS = ["all", "inProgress", "completed", "failed"];
		const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

		/** 状态判定与筛选归组同一对函数（对齐 ZCode）：看到什么徽章就落在哪一组。 */
		function cronHasFailure(task) {
			return task.lifecycleStatus === "failed" || Boolean(String(task.lastError ?? "").trim());
		}
		function cronStatusKind(task) {
			if (task.lifecycleStatus === "failed") return "failed";
			if (task.lifecycleStatus === "completed") return "completed";
			if (task.lifecycleStatus === "paused" || !task.enabled) return "paused";
			return "active";
		}
		/** 失败痕迹归失败；completed 归已完成；其余（active 与已暂停）都算进行中。 */
		function cronFilterKind(task) {
			if (cronHasFailure(task)) return "failed";
			return cronStatusKind(task) === "completed" ? "completed" : "inProgress";
		}

		function cronScheduleText(task, t) {
			const s = task.schedule;
			if (s.unit === "minute") return format(t("cron.schedule.everyMinutes"), { n: s.interval });
			const time = `${pad2(s.hour ?? 9)}:${pad2(s.minute ?? 0)}`;
			if (s.unit === "day") return format(t("cron.schedule.daily"), { time });
			if (s.unit === "week") {
				const days = [...(s.weekdays ?? [])]
					.sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
					.map((d) => t(`cron.weekday.${d}`))
					.join(t("cron.join"));
				return format(t("cron.schedule.weekly"), { days, time });
			}
			return format(t("cron.schedule.monthly"), { day: s.monthDay ?? 1, time });
		}

		/** 下次运行相对时间；过期/缺失返回 null（非运行中卡片不展示，防过期时间误导）。 */
		function cronFutureRelative(ts, t) {
			if (typeof ts !== "number" || ts <= Date.now()) return null;
			const minutes = Math.round((ts - Date.now()) / 60000);
			if (minutes < 1) return t("cron.soon");
			if (minutes < 60) return format(t("cron.in.minutes"), { n: minutes });
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return format(t("cron.in.hours"), { n: hours });
			return format(t("cron.in.days"), { n: Math.floor(hours / 24) });
		}

		const CRON_STATUS_ICON = {
			active: ICONS.cronActive,
			paused: ICONS.cronPaused,
			completed: ICONS.cronDone,
			failed: ICONS.cronFailed,
		};

		/**
		 * 面板左缘 = 侧栏宽度。从自身区域根（.fi-region）向上爬，跳过零宽包装层，
		 * 父容器首次显著变宽（≥1.5×）处即「侧栏列 | 主区域」的布局分界，当前节点
		 * 就是侧栏列。找不到时退化为全屏覆盖。ResizeObserver 跟踪拖拽调宽与折叠。
		 */
		function useSidebarWidth(enabled) {
			const [width, setWidth] = react.useState(0);
			react.useEffect(() => {
				if (!enabled) return undefined;
				let el = document.querySelector(".fi-region");
				let sidebar = null;
				while (el !== null && el !== undefined) {
					const parent = el.parentElement;
					if (parent === null) break;
					const w = el.getBoundingClientRect().width;
					const parentW = parent.getBoundingClientRect().width;
					if (w > 0 && parentW > w * 1.5) {
						sidebar = el;
						break;
					}
					el = parent;
				}
				if (sidebar === null || sidebar.getBoundingClientRect().width <= 0) {
					setWidth(0);
					return undefined;
				}
				const update = () => setWidth(sidebar.getBoundingClientRect().width);
				update();
				const observer = new ResizeObserver(update);
				observer.observe(sidebar);
				return () => observer.disconnect();
			}, [enabled]);
			return width;
		}

		function CronRow({ task, onRowAction, t }) {
			const kind = cronStatusKind(task);
			const failed = cronHasFailure(task);
			const scheduleText = cronScheduleText(task, t);
			const nextText = kind === "active" && !failed ? cronFutureRelative(task.nextRunAt, t) : null;
			const badgeText = nextText !== null
				? `${scheduleText} · ${format(t("cron.next"), { when: nextText })}`
				: scheduleText;
			const badge = jsx.jsx("span", {
				className: kind === "active" && !failed ? "fi-cron-badge" : "fi-cron-badge fi-cron-badge--dim",
				title: scheduleText,
				children: jsx.jsx("span", { className: "fi-cron-badge-text", children: badgeText }),
			});
			return jsx.jsxs("div", {
				className: `fi-cron-row${kind === "completed" ? " fi-cron-row--done" : ""}`,
				role: "button",
				tabIndex: 0,
				onClick: () => onRowAction("edit", task, null),
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") {
						// 聚焦在行内 ⋯ 按钮上时交给按钮自身的键盘行为，不触发行编辑。
						if (event.target !== event.currentTarget) return;
						event.preventDefault();
						onRowAction("edit", task, null);
					}
				},
				children: [
					jsx.jsx("span", { className: `fi-cron-status fi-cron-status--${kind}`, title: t(`cron.status.${kind}`),
						children: icon(CRON_STATUS_ICON[kind], 16) }),
					jsx.jsxs("span", { className: "fi-cron-main", children: [
						jsx.jsx("span", { className: "fi-cron-name", children: task.title }),
						failed
							? jsx.jsxs("span", { className: "fi-cron-meta", children: [
								jsx.jsx("span", { className: "fi-cron-failed", title: task.lastError ?? undefined, children:
									[icon(ICONS.cronFailed, 12), t("cron.lastError")] }),
								badge,
							] })
							: kind === "active"
								? jsx.jsx("span", { className: "fi-cron-meta", children: badge })
								: jsx.jsxs("span", { className: "fi-cron-meta", children: [
									t(`cron.status.${kind}`),
									badge,
								] }),
					] }),
					jsx.jsx("span", { className: "fi-cron-count", children: format(t("cron.count"), { n: task.runCount }) }),
					jsx.jsx("button", {
						type: "button",
						className: "fi-cron-more",
						"aria-label": t("cron.menu.edit"),
						title: t("cron.menu.edit"),
						onClick: (event) => {
							event.stopPropagation();
							onRowAction("menu", task, event);
						},
						children: icon(ICONS.cronMore, 16),
					}),
				],
			});
		}

		/** 行操作菜单。点外/Escape/缩放关闭；删除走两步确认（第二次点击才执行）。 */
		function CronRowMenu({ x, y, task, busy, onAction, onClose, t }) {
			const [confirming, setConfirming] = react.useState(false);
			react.useEffect(() => {
				const onDocClick = (event) => {
					if (event.target instanceof Element && event.target.closest(".fi-fb-menu")) return;
					onClose();
				};
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("click", onDocClick, true);
				window.addEventListener("resize", onClose);
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("click", onDocClick, true);
					window.removeEventListener("resize", onClose);
					window.removeEventListener("keydown", onKey);
				};
			}, [onClose]);
			const kind = cronStatusKind(task);
			const items = [
				{ key: "runNow", label: t("cron.menu.runNow"), disabled: busy },
				task.lastSessionId ? { key: "openSession", label: t("cron.menu.openSession") } : null,
				kind === "failed" ? { key: "enable", label: t("cron.menu.enable") } : null,
				kind === "active" || kind === "paused"
					? { key: "toggle", label: task.enabled ? t("cron.menu.pause") : t("cron.menu.resume") }
					: null,
				{ key: "edit", label: t("cron.menu.edit") },
				{
					key: "delete",
					label: confirming ? t("cron.menu.confirmDelete") : t("cron.menu.delete"),
					danger: true,
					onClick: () => (confirming ? onAction("delete", task) : setConfirming(true)),
				},
			].filter((item) => item !== null);
			const style = {
				left: Math.max(4, Math.min(x, window.innerWidth - 190)),
				top: Math.max(4, Math.min(y, window.innerHeight - items.length * 34 - 12)),
			};
			return jsx.jsx("div", { className: "fi-fb-menu", style, children: items.map((item) =>
				jsx.jsx("button", {
					type: "button",
					className: "fi-fb-menu-item",
					style: item.danger ? { color: "var(--dsw-alias-state-danger-primary)" } : undefined,
					disabled: item.disabled === true,
					onClick: () => (item.onClick !== undefined ? item.onClick() : onAction(item.key, task)),
					children: item.label,
				}, item.key)) });
		}

		/**
		 * 新建/编辑表单。客户端先做本地校验（面板语言），主进程校验作为兜底；
		 * 保存成功由父层关闭表单，失败把主进程错误文案显示在表单底部。
		 */
		function CronForm({ initial, onSave, onCancel, t }) {
			const [title, setTitle] = react.useState(initial?.title ?? "");
			const [targetKind, setTargetKind] = react.useState(initial?.targetKind ?? "default");
			const [folderPath, setFolderPath] = react.useState(initial?.workspacePath ?? "");
			const [unit, setUnit] = react.useState(initial?.schedule?.unit ?? "minute");
			const [every, setEvery] = react.useState(String(initial?.schedule?.interval ?? 15));
			const [at, setAt] = react.useState(
				`${pad2(initial?.schedule?.hour ?? 9)}:${pad2(initial?.schedule?.minute ?? 0)}`);
			const [weekdays, setWeekdays] = react.useState(() => new Set(initial?.schedule?.weekdays ?? [1]));
			const [monthDay, setMonthDay] = react.useState(String(initial?.schedule?.monthDay ?? 1));
			const [plan, setPlan] = react.useState(initial?.recurring === false ? "limited" : "forever");
			const [maxRuns, setMaxRuns] = react.useState(String(initial?.maxRuns ?? 1));
			const [prompt, setPrompt] = react.useState(initial?.prompt ?? "");
			const [error, setError] = react.useState(null);
			const [saving, setSaving] = react.useState(false);
			const [defaultDir, setDefaultDir] = react.useState(null);

			react.useEffect(() => {
				if (FI_CRON === null) return;
				FI_CRON.defaultDir().then((r) => {
					if (r?.ok === true) setDefaultDir(r.path);
				}).catch(() => {});
			}, []);

			const pickFolder = () => {
				FI_CRON?.pickFolder().then((r) => {
					if (r?.ok === true && r.path) {
						setFolderPath(r.path);
						setTargetKind("folder");
					}
				}).catch(() => {});
			};

			const toggleWeekday = (day) => {
				setWeekdays((prev) => {
					const next = new Set(prev);
					if (next.has(day)) next.delete(day);
					else next.add(day);
					return next;
				});
			};

			const save = () => {
				if (title.trim() === "") return setError(t("cron.validate.name"));
				if (prompt.trim() === "") return setError(t("cron.validate.prompt"));
				if (targetKind === "folder" && folderPath.trim() === "") return setError(t("cron.validate.folder"));
				const everyNumber = Math.floor(Number(every));
				if (!Number.isFinite(everyNumber) || everyNumber < 1) {
					return setError(t("cron.validate.interval"));
				}
				if (unit === "week" && weekdays.size === 0) return setError(t("cron.validate.weekdays"));
				const runs = Math.floor(Number(maxRuns));
				if (plan === "limited" && (!Number.isFinite(runs) || runs < 1)) {
					return setError(t("cron.validate.maxRuns"));
				}
				const draft = {
					title: title.trim(),
					prompt: prompt.trim(),
					targetKind,
					workspacePath: targetKind === "folder" ? folderPath.trim() : null,
					schedule: unit === "minute"
						? { unit, interval: everyNumber }
						: unit === "week"
							? { unit, interval: everyNumber, at, weekdays: [...weekdays] }
							: unit === "month"
								? { unit, interval: everyNumber, at, monthDay: Math.floor(Number(monthDay)) || 1 }
								: { unit, interval: everyNumber, at },
					recurring: plan === "forever",
					maxRuns: plan === "forever" ? null : runs,
				};
				setSaving(true);
				setError(null);
				Promise.resolve(onSave(draft)).then((failure) => {
					setSaving(false);
					if (failure !== null && failure !== undefined) setError(failure);
				}).catch((err) => {
					setSaving(false);
					setError(err?.message ?? String(err));
				});
			};

			const intervalLabel = t(`cron.form.intervalUnit.${{ minute: "minutes", day: "days", week: "weeks", month: "months" }[unit]}`);
			return jsx.jsxs("div", { className: "fi-cron-form", children: [
				jsx.jsxs("div", { className: "fi-cron-field", children: [
					jsx.jsx("span", { className: "fi-cron-label", children: t("cron.form.name") }),
					jsx.jsx("input", {
						className: "fi-cron-input", value: title, maxLength: 120,
						placeholder: t("cron.form.namePlaceholder"), spellCheck: false,
						onChange: (event) => setTitle(event.target.value),
					}),
				] }),
				jsx.jsxs("div", { className: "fi-cron-field", children: [
					jsx.jsx("span", { className: "fi-cron-label", children: t("cron.form.location") }),
					jsx.jsxs("div", { className: "fi-cron-seg", children: [
						jsx.jsx("button", { type: "button", "aria-pressed": targetKind === "default" ? "true" : "false",
							onClick: () => setTargetKind("default"), children: t("cron.form.locationDefault") }),
						jsx.jsx("button", { type: "button", "aria-pressed": targetKind === "folder" ? "true" : "false",
							onClick: () => setTargetKind("folder"), children: t("cron.form.locationFolder") }),
					] }),
					targetKind === "default"
						? jsx.jsx("span", { className: "fi-cron-hint", children:
							`${t("cron.form.locationDefaultHint")}${defaultDir !== null ? ` · ${defaultDir}` : ""}` })
						: jsx.jsxs("div", { className: "fi-cron-path", children: [
							jsx.jsx("button", { type: "button", className: "fi-cron-btn", onClick: pickFolder, children:
								t("cron.form.pick") }),
							jsx.jsx("span", { className: "fi-cron-path-text", children:
								folderPath === "" ? t("cron.form.noFolder") : folderPath }),
						] }),
					jsx.jsx("span", { className: "fi-cron-hint", children:
						targetKind === "folder" ? t("cron.form.locationFolderHint") : "" }),
				] }),
				jsx.jsxs("div", { className: "fi-cron-field", children: [
					jsx.jsx("span", { className: "fi-cron-label", children: t("cron.form.repeat") }),
					jsx.jsxs("div", { className: "fi-cron-seg", children: [
						["minute", "day", "week", "month"].map((key) =>
							jsx.jsx("button", {
								type: "button",
								"aria-pressed": unit === key ? "true" : "false",
								onClick: () => setUnit(key),
								children: t(`cron.form.unit.${key}`),
							}, key)),
					] }),
					unit !== "minute"
						? jsx.jsx("input", { className: "fi-cron-input", type: "time", value: at,
							onChange: (event) => setAt(event.target.value), "aria-label": t("cron.form.time") })
						: null,
					unit === "week"
						? jsx.jsx("div", { className: "fi-cron-wd", children: WEEKDAY_ORDER.map((day) =>
							jsx.jsx("button", {
								type: "button",
								"aria-pressed": weekdays.has(day) ? "true" : "false",
								onClick: () => toggleWeekday(day),
								children: t(`cron.weekday.${day}`),
							}, day)) })
						: null,
					unit === "month"
						? jsx.jsx("input", { className: "fi-cron-input", type: "number", min: 1, max: 28, value: monthDay,
							onChange: (event) => setMonthDay(event.target.value), "aria-label": t("cron.form.monthDay"),
							style: { maxWidth: 120 } })
						: null,
					jsx.jsxs("div", { className: "fi-cron-grid2", children: [
						jsx.jsxs("div", { className: "fi-cron-field", children: [
							jsx.jsx("span", { className: "fi-cron-label", children: t("cron.form.interval") }),
							jsx.jsx("input", { className: "fi-cron-input", type: "number", min: 1, max: 9999, value: every,
								onChange: (event) => setEvery(event.target.value),
								"aria-label": t("cron.form.interval"), style: { maxWidth: 120 } }),
							jsx.jsx("span", { className: "fi-cron-hint", children: intervalLabel }),
						] }),
					] }),
				] }),
				jsx.jsxs("div", { className: "fi-cron-field", children: [
					jsx.jsx("span", { className: "fi-cron-label", children: t("cron.form.plan") }),
					jsx.jsxs("div", { className: "fi-cron-seg", children: [
						jsx.jsx("button", { type: "button", "aria-pressed": plan === "forever" ? "true" : "false",
							onClick: () => setPlan("forever"), children: t("cron.form.plan.forever") }),
						jsx.jsx("button", { type: "button", "aria-pressed": plan === "limited" ? "true" : "false",
							onClick: () => setPlan("limited"), children: t("cron.form.plan.limited") }),
					] }),
					plan === "limited"
						? jsx.jsx("input", { className: "fi-cron-input", type: "number", min: 1, max: 9999, value: maxRuns,
							onChange: (event) => setMaxRuns(event.target.value),
							"aria-label": t("cron.form.maxRuns"), style: { maxWidth: 120 } })
						: null,
				] }),
				jsx.jsxs("div", { className: "fi-cron-field", children: [
					jsx.jsx("span", { className: "fi-cron-label", children: t("cron.form.prompt") }),
					jsx.jsx("textarea", {
						className: "fi-cron-textarea", value: prompt, maxLength: 20000,
						placeholder: t("cron.form.promptPlaceholder"),
						onChange: (event) => setPrompt(event.target.value),
					}),
				] }),
				jsx.jsx("div", { className: "fi-cron-alert", children: error ?? "" }),
				jsx.jsxs("div", { className: "fi-cron-foot", children: [
					jsx.jsx("button", { type: "button", className: "fi-cron-btn", disabled: saving, onClick: onCancel, children:
						t("cron.form.cancel") }),
					jsx.jsx("button", { type: "button", className: "fi-cron-btn fi-cron-btn--primary", disabled: saving, onClick: save, children:
						saving ? t("cron.form.saving") : t("cron.form.save") }),
				] }),
			] });
		}

		/**
		 * 定时任务整页面板：portal 到 body，覆盖侧栏右侧的全部区域。左缘实时跟随
		 * 侧栏宽度；Esc 分层退出（菜单→关菜单、表单→回列表、列表→关面板），
		 * 另有再次点击侧栏按钮 / 任何会话被打开时由父层关闭。
		 * 视图内路由：列表 / 新建 / 编辑（对齐 ZCode「列表 → 整页编辑」的换页模式）。
		 */
		function CronPanel({ open, onClose, openSession, t }) {
			const [tasks, setTasks] = react.useState(null);
			const [filter, setFilter] = react.useState("all");
			const [view, setView] = react.useState({ mode: "list" });
			const [menu, setMenu] = react.useState(null);
			const [busyId, setBusyId] = react.useState(null);
			const [note, setNote] = react.useState(null);
			const noteTimer = react.useRef(undefined);
			const sidebarWidth = useSidebarWidth(open);

			// 打开即复位（对齐 ZCode：切换视图即回到「全部」），并拉一次全量。
			react.useEffect(() => {
				if (!open) return;
				setFilter("all");
				setView({ mode: "list" });
				setMenu(null);
				setBusyId(null);
				setNote(null);
				if (FI_CRON !== null) {
					FI_CRON.list().then((r) => {
						setTasks(r?.ok === true && Array.isArray(r.tasks) ? r.tasks : []);
					}).catch(() => setTasks([]));
				}
			}, [open]);

			// 主进程每次落库后推全量；仅面板打开期间订阅。
			react.useEffect(() => {
				if (!open || FI_CRON === null) return undefined;
				return FI_CRON.onChanged((next) => setTasks(Array.isArray(next) ? next : []));
			}, [open]);

			// Esc 分层退出：行操作菜单打开时只关菜单（菜单自身的 Escape 监听负责）；
			// 表单视图先取消表单回列表（防误触丢掉填了一半的输入）；列表视图才关面板。
			react.useEffect(() => {
				if (!open) return undefined;
				const onKey = (event) => {
					if (event.isComposing || event.key !== "Escape") return;
					if (menu !== null) return;
					if (view.mode !== "list") setView({ mode: "list" });
					else onClose();
				};
				document.addEventListener("keydown", onKey);
				return () => document.removeEventListener("keydown", onKey);
			}, [open, onClose, view.mode, menu]);

			const showNote = (text) => {
				setNote(text);
				if (noteTimer.current !== undefined) window.clearTimeout(noteTimer.current);
				noteTimer.current = window.setTimeout(() => setNote(null), 3000);
			};

			if (!open) return null;

			if (FI_CRON === null) {
				return reactDom.createPortal(
					jsx.jsx("div", { className: "fi-cron-root", style: { left: sidebarWidth }, children:
						jsx.jsx("div", { className: "fi-cron-inner", children:
							jsx.jsx("div", { className: "fi-cron-note", children: t("cron.desktopOnly") }) }) }),
					document.body,
				);
			}

			const act = (id, operation) => {
				if (busyId !== null) return;
				setBusyId(id);
				const call = operation === "delete" ? FI_CRON.remove(id)
					: operation === "runNow" ? FI_CRON.runNow(id)
						: operation === "toggle" || operation === "enable"
							? FI_CRON.setEnabled(id, operation === "enable" ? true : !(tasks ?? []).find((task) => task.id === id)?.enabled)
							: null;
				if (call === null) {
					setBusyId(null);
					return;
				}
				Promise.resolve(call).then((r) => {
					setBusyId(null);
					if (r?.ok === false) showNote(format(t("cron.op.failed"), { msg: r.error ?? "" }));
				}).catch((err) => {
					setBusyId(null);
					showNote(format(t("cron.op.failed"), { msg: err?.message ?? String(err) }));
				});
			};

			/** 行内路由：⋯ 按钮 → 打开菜单；行点击/回车 → 进编辑。 */
			const handleRowAction = (action, task, event) => {
				if (action === "menu") {
					setMenu({ x: event.clientX, y: event.clientY, task });
					return;
				}
				if (action === "edit") {
					setMenu(null);
					setView({ mode: "edit", task });
				}
			};

			/** 菜单项动作：立即运行/打开会话/启停/编辑/删除。 */
			const handleMenuAction = (action, task) => {
				setMenu(null);
				if (action === "edit") {
					setView({ mode: "edit", task });
					return;
				}
				if (action === "openSession") {
					if (task.lastSessionId !== null) {
						openSession(task.lastSessionId);
						onClose();
					}
					return;
				}
				act(task.id, action);
			};

			const save = (draft) => view.mode === "create" ? FI_CRON.create(draft) : FI_CRON.update(view.task.id, draft);

			const list = tasks ?? [];
			const visible = filter === "all" ? list : list.filter((task) => cronFilterKind(task) === filter);

			let body;
			if (view.mode === "create" || view.mode === "edit") {
				body = jsx.jsx(CronForm, {
					initial: view.mode === "edit" ? view.task : null,
					onSave: (draft) => save(draft).then((r) => {
						if (r?.ok === true) setView({ mode: "list" });
						return r?.ok === true ? null : r?.error ?? "error";
					}),
					onCancel: () => setView({ mode: "list" }),
					t,
				});
			} else if (tasks === null) {
				body = jsx.jsx("div", { className: "fi-cron-note", children: t("empty.loading") });
			} else if (list.length === 0) {
				body = jsx.jsxs("div", { className: "fi-cron-empty", children: [
					jsx.jsx("span", { children: t("cron.empty.title") }),
					jsx.jsx("button", { type: "button", className: "fi-cron-btn fi-cron-btn--primary",
						onClick: () => setView({ mode: "create" }), children: t("cron.create") }),
				] });
			} else {
				body = jsx.jsxs(react.Fragment, { children: [
					jsx.jsxs("div", { className: "fi-cron-chips", children: [
						CRON_FILTERS.map((key) => jsx.jsx("button", {
							type: "button",
							className: "fi-cron-chip",
							"aria-pressed": filter === key ? "true" : "false",
							onClick: () => setFilter(key),
							children: t(`cron.filter.${key}`),
						}, key)),
					] }),
					note !== null ? jsx.jsx("div", { className: "fi-cron-alert", children: note }) : null,
					visible.length === 0
						? jsx.jsx("div", { className: "fi-cron-note", children: t("cron.filter.empty") })
						: jsx.jsx("div", { className: "fi-cron-list", children: visible.map((task) =>
							jsx.jsx(CronRow, { task, onRowAction: handleRowAction, t }, task.id)) }),
				] });
			}

			return reactDom.createPortal(
				jsx.jsxs("div", { className: "fi-cron-root", style: { left: sidebarWidth }, children: [
					jsx.jsx("div", { className: "fi-cron-scroll", children:
						jsx.jsxs("div", { className: "fi-cron-inner", children: [
							view.mode === "list"
								? jsx.jsxs("div", { className: "fi-cron-head", children: [
									jsx.jsxs("div", { className: "fi-cron-heading", children: [
										jsx.jsxs("span", { className: "fi-cron-title", children: [
											icon(ICONS.schedule, 20),
											t("cron.title"),
										] }),
										jsx.jsx("span", { className: "fi-cron-sub", children: t("cron.subtitle") }),
									] }),
									jsx.jsxs("div", { className: "fi-cron-head-actions", children: [
										jsx.jsx("button", { type: "button", className: "fi-cron-btn fi-cron-iconbtn",
											"aria-label": t("cron.refresh"), title: t("cron.refresh"),
											onClick: () => FI_CRON.list().then((r) => setTasks(r?.ok === true && Array.isArray(r.tasks) ? r.tasks : [])).catch(() => {}),
											children: icon(ICONS.refresh, 14) }),
										jsx.jsx("button", { type: "button", className: "fi-cron-btn fi-cron-btn--primary",
											onClick: () => setView({ mode: "create" }), children: t("cron.create") }),
									] }),
								] })
								: jsx.jsx("div", { className: "fi-cron-head", children:
									jsx.jsxs("div", { className: "fi-cron-heading", children: [
										jsx.jsxs("span", { className: "fi-cron-title", children: [
											icon(ICONS.schedule, 20),
											view.mode === "create" ? t("cron.form.newTitle") : t("cron.form.editTitle"),
										] }),
									] }) }),
							body,
						] }) }),
					menu !== null ? jsx.jsx(CronRowMenu, {
						x: menu.x,
						y: menu.y,
						task: menu.task,
						busy: busyId === menu.task.id,
						onAction: handleMenuAction,
						onClose: () => setMenu(null),
						t,
					}) : null,
				] }),
				document.body,
			);
		}
		//#endregion

		//#region plugin center
		/**
		 * 插件中心（0.7）。上区「已安装」＝ fi 专属 profile 的插件清单（「在 fi
		 * 里安装」的边界；内置 fi-sidebar 由主进程过滤），行尾可卸载（两步确认，
		 * 主进程转发 `dsh plugin --profile fi remove`）；下区「推荐」＝随 fi
		 * 发版的静态推荐表，推荐位常驻不因已安装消失——未安装给「安装」按钮
		 * （主进程转发 `dsh plugin --profile fi add`），已安装按包名匹配换成
		 * 「已安装」徽章，卸载后自动变回安装按钮。安装/卸载都要重启 fi 才被
		 * 运行中的 dsh 加载/卸掉，成功后以提示行说明。Electron 桥见
		 * src/main/plugin-center.ts；缺失（浏览器直开 dsh 网页）时面板退化为
		 * 提示行，与定时任务同款降级。
		 */
		const FI_PLUGINS = typeof window !== "undefined" ? window.fi?.plugins ?? null : null;

		/** 推荐表（随 fi 发版人工维护）；一句话介绍走词典键 plugin.rec.<name>.desc。
		 *  spec 统一走 GitHub 直装（github:<owner>/<repo>，子目录包加 #path:<dir>），
		 *  安装即 `dsh plugin --profile fi add <spec>` → pnpm 从仓库默认分支拉取，
		 *  不经 npm registry；「已安装」匹配按包名（deps 键），与 spec 形态无关。 */
		const RECOMMENDED_PLUGINS = [
			{
				name: "dsh-whale-widget",
				spec: "github:MeteorNOX/DeepSeek-Balance-Whale-Widget",
				version: "0.3.10",
				repo: "https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget",
			},
			{
				name: "dsh-fx-review",
				spec: "github:xianglifei/fx-review#path:dsh-plugin",
				version: "0.3.1",
				repo: "https://github.com/xianglifei/fx-review",
			},
		];

		/** 仓库外链：target=_blank 在 fi 里经 window.open 处理器走系统浏览器。 */
		function PluginRepoLink({ repo, t }) {
			return jsx.jsxs("a", {
				className: "fi-plugin-repo",
				href: repo,
				target: "_blank",
				rel: "noreferrer",
				"aria-label": t("plugin.repo"),
				title: t("plugin.repo"),
				children: [icon(ICONS.pluginRepo, 14), "GitHub"],
			});
		}

		/**
		 * 已安装信息行：名称 + 版本 + 一句话描述（取自插件自身 package.json），
		 * 行尾卸载按钮走两步确认（第一次点换「确认卸载」，3s 不点第二下自动
		 * 复位，对齐定时任务删除的防误触口径）。
		 */
		function InstalledPluginRow({ plugin, busy, onUninstall, t }) {
			const [confirming, setConfirming] = react.useState(false);
			const timer = react.useRef(undefined);
			react.useEffect(() => () => {
				if (timer.current !== undefined) window.clearTimeout(timer.current);
			}, []);
			const click = () => {
				if (confirming) {
					if (timer.current !== undefined) window.clearTimeout(timer.current);
					setConfirming(false);
					onUninstall(plugin);
					return;
				}
				setConfirming(true);
				timer.current = window.setTimeout(() => setConfirming(false), 3000);
			};
			return jsx.jsxs("div", { className: "fi-plugin-row", children: [
				jsx.jsxs("span", { className: "fi-plugin-main", children: [
					jsx.jsxs("span", { className: "fi-plugin-name-line", children: [
						jsx.jsx("span", { className: "fi-plugin-name", children: plugin.name }),
						jsx.jsx("span", { className: "fi-plugin-ver", children: plugin.version }),
					] }),
					plugin.description
						? jsx.jsx("span", { className: "fi-plugin-desc", title: plugin.description, children: plugin.description })
						: null,
				] }),
				plugin.repo ? jsx.jsx(PluginRepoLink, { repo: plugin.repo, t }) : null,
				jsx.jsx("button", {
					type: "button",
					className: confirming ? "fi-plugin-uninstall fi-plugin-uninstall--confirm" : "fi-plugin-uninstall",
					"aria-label": t("plugin.uninstall"),
					title: t("plugin.uninstall"),
					disabled: busy,
					onClick: click,
					children: confirming ? t("plugin.uninstallConfirm") : icon(ICONS.pluginRemove, 14),
				}),
			] });
		}

		/** 推荐行：行尾按安装状态切换 安装 / 安装中… / 已安装。 */
		function RecommendedPluginRow({ rec, state, busy, onInstall, t }) {
			const action = state === "installed"
				? jsx.jsxs("span", { className: "fi-plugin-installed", children: [
					icon(ICONS.cronDone, 14),
					t("plugin.installedBadge"),
				] })
				: jsx.jsx("button", {
					type: "button",
					className: "fi-cron-btn fi-cron-btn--primary",
					disabled: busy || state === "installing",
					onClick: () => onInstall(rec),
					children: state === "installing"
						? t("plugin.installing")
						: [icon(ICONS.pluginInstall, 14), t("plugin.install")],
				});
			return jsx.jsxs("div", { className: "fi-plugin-row", children: [
				jsx.jsxs("span", { className: "fi-plugin-main", children: [
					jsx.jsxs("span", { className: "fi-plugin-name-line", children: [
						jsx.jsx("span", { className: "fi-plugin-name", children: rec.name }),
						jsx.jsx("span", { className: "fi-plugin-ver", children: rec.version }),
					] }),
					jsx.jsx("span", { className: "fi-plugin-desc", children: t(`plugin.rec.${rec.name}.desc`) }),
				] }),
				jsx.jsx(PluginRepoLink, { repo: rec.repo, t }),
				action,
			] });
		}

		function PluginCenterPanel({ open, onClose, t }) {
			const [installed, setInstalled] = react.useState(null);
			const [installing, setInstalling] = react.useState(null);
			const [removing, setRemoving] = react.useState(null);
			const [alert, setAlert] = react.useState(null);
			const [note, setNote] = react.useState(null);
			const noteTimer = react.useRef(undefined);
			const sidebarWidth = useSidebarWidth(open);

			// 打开即复位并拉一次全量。
			react.useEffect(() => {
				if (!open) return;
				setInstalling(null);
				setRemoving(null);
				setAlert(null);
				setNote(null);
				if (FI_PLUGINS !== null) {
					FI_PLUGINS.list().then((r) => {
						setInstalled(r?.ok === true && Array.isArray(r.plugins) ? r.plugins : []);
					}).catch(() => setInstalled([]));
				}
			}, [open]);

			// 主进程安装成功后推全量；仅面板打开期间订阅。
			react.useEffect(() => {
				if (!open || FI_PLUGINS === null) return undefined;
				return FI_PLUGINS.onChanged((next) => setInstalled(Array.isArray(next) ? next : []));
			}, [open]);

			// Esc 退出面板。
			react.useEffect(() => {
				if (!open) return undefined;
				const onKey = (event) => {
					if (event.isComposing || event.key !== "Escape") return;
					onClose();
				};
				document.addEventListener("keydown", onKey);
				return () => document.removeEventListener("keydown", onKey);
			}, [open, onClose]);

			const showNote = (text) => {
				setNote(text);
				if (noteTimer.current !== undefined) window.clearTimeout(noteTimer.current);
				noteTimer.current = window.setTimeout(() => setNote(null), 3000);
			};

			if (!open) return null;

			if (FI_PLUGINS === null) {
				return reactDom.createPortal(
					jsx.jsx("div", { className: "fi-cron-root", style: { left: sidebarWidth }, children:
						jsx.jsx("div", { className: "fi-cron-inner", children:
							jsx.jsx("div", { className: "fi-cron-note", children: t("plugin.desktopOnly") }) }) }),
					document.body,
				);
			}

			const refresh = () => FI_PLUGINS.list().then((r) => {
				setInstalled(r?.ok === true && Array.isArray(r.plugins) ? r.plugins : []);
			}).catch(() => {});

			const install = (rec) => {
				if (installing !== null) return;
				setInstalling(rec.spec);
				setAlert(null);
				FI_PLUGINS.install(rec.spec).then((r) => {
					setInstalling(null);
					if (r?.ok === true) showNote(t("plugin.installedNote"));
					else setAlert(format(t("plugin.installFailed"), { msg: r?.error ?? "" }));
				}).catch((err) => {
					setInstalling(null);
					setAlert(format(t("plugin.installFailed"), { msg: err?.message ?? String(err) }));
				});
			};

			const uninstall = (plugin) => {
				if (removing !== null) return;
				setRemoving(plugin.name);
				setAlert(null);
				FI_PLUGINS.remove(plugin.name).then((r) => {
					setRemoving(null);
					if (r?.ok === true) showNote(t("plugin.uninstalledNote"));
					else setAlert(format(t("plugin.uninstallFailed"), { msg: r?.error ?? "" }));
				}).catch((err) => {
					setRemoving(null);
					setAlert(format(t("plugin.uninstallFailed"), { msg: err?.message ?? String(err) }));
				});
			};

			// 已安装判定按包名匹配推荐位；空表（未初始化 profile / 只剩内置）走空态提示。
			const installedNames = new Set((installed ?? []).map((p) => p.name));

			let installedBody;
			if (installed === null) {
				installedBody = jsx.jsx("div", { className: "fi-cron-note", children: t("empty.loading") });
			} else if (installed.length === 0) {
				installedBody = jsx.jsx("div", { className: "fi-plugin-empty", children: t("plugin.installed.empty") });
			} else {
				installedBody = jsx.jsx("div", { className: "fi-plugin-list", children:
					installed.map((plugin) => jsx.jsx(InstalledPluginRow, {
						plugin,
						busy: removing === plugin.name,
						onUninstall: uninstall,
						t,
					}, plugin.name)) });
			}

			return reactDom.createPortal(
				jsx.jsxs("div", { className: "fi-cron-root", style: { left: sidebarWidth }, children: [
					jsx.jsx("div", { className: "fi-cron-scroll", children:
						jsx.jsxs("div", { className: "fi-cron-inner", children: [
							jsx.jsxs("div", { className: "fi-cron-head", children: [
								jsx.jsxs("div", { className: "fi-cron-heading", children: [
									jsx.jsxs("span", { className: "fi-cron-title", children: [
										icon(ICONS.plugins, 20),
										t("plugin.title"),
									] }),
									jsx.jsx("span", { className: "fi-cron-sub", children: t("plugin.subtitle") }),
								] }),
								jsx.jsxs("div", { className: "fi-cron-head-actions", children: [
									jsx.jsx("button", { type: "button", className: "fi-cron-btn fi-cron-iconbtn",
										"aria-label": t("plugin.refresh"), title: t("plugin.refresh"),
										onClick: refresh,
										children: icon(ICONS.refresh, 14) }),
								] }),
							] }),
							jsx.jsx("span", { className: "fi-plugin-section", children: t("plugin.installed") }),
							installedBody,
							jsx.jsx("span", { className: "fi-plugin-section", children: t("plugin.recommended") }),
							note !== null ? jsx.jsx("div", { className: "fi-plugin-note", children: note }) : null,
							alert !== null ? jsx.jsx("div", { className: "fi-cron-alert", children: alert }) : null,
							jsx.jsx("div", { className: "fi-plugin-list", children:
								RECOMMENDED_PLUGINS.map((rec) => jsx.jsx(RecommendedPluginRow, {
									rec,
									state: installedNames.has(rec.name) ? "installed"
										: installing === rec.spec ? "installing" : "idle",
									busy: installing !== null,
									onInstall: install,
									t,
								}, rec.name)) }),
						] }) }),
				] }),
				document.body,
			);
		}
		//#endregion

		//#region quote-selection
		/**
		 * 选区引用（对齐 ZCode 的 Conversation Selection）：对话记录里选中文字 →
		 * 悬浮「添加到当前任务」→ 引用 chip 挂在输入框上方（conversation.input.dock
		 * 槽位）→ 发送时把引用拼成 markdown 引用块追加到提示词尾部，输入框始终保持
		 * 干净。composer 的发送出口只有 ConversationController.sendSession 一个，
		 * 且 InputHub 每次调用都动态解析服务实例——在实例上包一层完成合并；dsh 改版
		 * 导致补丁打不上时整个功能静默隐藏（菜单不出现，与「契约失效退回原生」的
		 * 既有策略一致）。
		 */
		const QUOTE_LIMITS = { single: 8000, count: 8, total: 16000 };

		/**
		 * dsh 对话流 kind（data-chat-flow-kind）→ 引用来源分类；未列出的流不可
		 * 引用。注意助手的流式回复是 assistant-step（step 投影为 step），纯
		 * assistant 只出现在中断边界等合成节点——漏掉它会让「在 AI 回答上选字」
		 * 整条失效。reasoning/tool 块渲染在 assistant-step 内部（无独立流项），
		 * 同样落进 assistant；独立的 tool-call / tool-result 流项归 tool。
		 */
		const QUOTE_FLOW_KINDS = {
			user: "user",
			steering: "user",
			assistant: "assistant",
			"assistant-step": "assistant",
			step: "assistant",
			reasoning: "reasoning",
			"tool-call": "tool",
			"tool-result": "tool",
		};

		/** 选区端点落在这些控件里就不算正文选区（contenteditable 即 composer 本体）。 */
		const QUOTE_EXCLUDED_SELECTOR = [
			"button", "input", "textarea", "select",
			"[contenteditable]", "[role='button']", "[role='menu']", "[role='dialog']",
			"[data-composer-chip]", "[data-fi-quote-tooltip]", "[data-fi-quote-dock]",
		].join(",");

		/**
		 * 选区资格审查（规则对齐 ZCode guardConversationSelectionCandidate）：
		 * 同一条对话流内、非控件端点、受支持的流类型、文本非空且有布局矩形，
		 * 全过才弹菜单；超单条上限的弹只读提示而非直接消失。
		 */
		function quoteGuardCandidate(input) {
			if (!input.enabled || !input.sameFlow || !input.insideTimeline || input.excluded
				|| !input.supportedKind || !input.text || !input.hasLayout) return "ineligible";
			return input.text.length > QUOTE_LIMITS.single ? "single-limit" : "eligible";
		}

		function quoteDedupeKey(quote) {
			return `${quote.kind}\0${quote.text}`;
		}

		/**
		 * 追加一条引用（对齐 ZCode appendConversationSelectionReference）：去重
		 * （同类型同文本）、条数与总长上限；重复添加按成功处理不重复入列。
		 */
		function appendQuote(current, quote) {
			if (quote.text.length > QUOTE_LIMITS.single) return { ok: false, reason: "single" };
			const key = quoteDedupeKey(quote);
			if (current.some((item) => quoteDedupeKey(item) === key)) {
				return { ok: true, quotes: current, duplicate: true };
			}
			if (current.length >= QUOTE_LIMITS.count) return { ok: false, reason: "count" };
			const totalLength = current.reduce((sum, item) => sum + item.text.length, 0);
			if (totalLength + quote.text.length > QUOTE_LIMITS.total) return { ok: false, reason: "total" };
			return { ok: true, quotes: [...current, quote], duplicate: false };
		}

		/** 发送失败回滚时把取走的引用并回（先取走的在前），按同一套上限收口。 */
		function mergeQuoteLists(primary, extra) {
			const merged = [];
			const seen = new Set();
			for (const quote of [...primary, ...extra]) {
				const key = quoteDedupeKey(quote);
				if (seen.has(key)) continue;
				seen.add(key);
				const totalLength = merged.reduce((sum, item) => sum + item.text.length, 0);
				if (merged.length >= QUOTE_LIMITS.count
					|| totalLength + quote.text.length > QUOTE_LIMITS.total) break;
				merged.push(quote);
			}
			return merged;
		}

		/**
		 * 引用块（模型可见形态）：markdown 引用块 + 来源标注头。dsh 的历史渲染
		 * 会把它显示为 blockquote——与 ZCode 不同，fi 无法重渲染宿主历史行来隐藏
		 * 尾块，干脆让它以原生引用块的样子可见，用户与模型都读得清楚。
		 */
		function buildQuoteBlock(quotes) {
			const parts = quotes.map((quote) => {
				const body = quote.text.split("\n").map((line) => (line.trim() === "" ? ">" : `> ${line}`));
				return [`> 【${quote.sourceLabel}】`, ...body].join("\n");
			});
			return parts.join("\n\n");
		}

		function appendQuoteBlock(text, quotes) {
			if (quotes.length === 0) return String(text ?? "");
			const block = buildQuoteBlock(quotes);
			const base = String(text ?? "");
			return base === "" ? block : `${base}\n\n${block}`;
		}

		/**
		 * 引用池：module 级按会话分桶（对齐 ZCode 的模块级 Map，不进 React 状态，
		 * 组件经订阅读取）。note 是「上次添加失败的原因」，在 chip 区提示一行，
		 * 下次成功添加/删除/清空即消。
		 */
		function createQuoteStore() {
			const EMPTY = { quotes: [], note: null };
			const bySession = new Map();
			const listeners = new Set();
			const emit = () => {
				for (const fn of [...listeners]) { try { fn(); } catch { /* 订阅方异常不外溢 */ } }
			};
			const recordOf = (sessionId) => bySession.get(sessionId) ?? EMPTY;
			const commit = (sessionId, record) => {
				if (record.quotes.length === 0 && record.note === null) bySession.delete(sessionId);
				else bySession.set(sessionId, record);
				emit();
			};
			return {
				subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
				record: recordOf,
				add(sessionId, quote) {
					const current = recordOf(sessionId);
					const result = appendQuote(current.quotes, quote);
					if (result.ok) commit(sessionId, { quotes: result.quotes, note: null });
					else commit(sessionId, { quotes: current.quotes, note: result.reason });
					return result;
				},
				remove(sessionId, quoteId) {
					commit(sessionId, { quotes: recordOf(sessionId).quotes.filter((q) => q.id !== quoteId), note: null });
				},
				clear(sessionId) { commit(sessionId, EMPTY); },
				/** 取走并清空（发送即消费；无引用时不动桶，避免无谓通知）。 */
				take(sessionId) {
					const quotes = recordOf(sessionId).quotes;
					if (quotes.length > 0) commit(sessionId, EMPTY);
					return quotes;
				},
				restore(sessionId, quotes) {
					if (quotes.length === 0) return;
					const current = recordOf(sessionId);
					commit(sessionId, { quotes: mergeQuoteLists(quotes, current.quotes), note: null });
				},
			};
		}

		const quoteStore = createQuoteStore();

		let quoteSeq = 0;
		function makeQuote(text, kind, sourceLabel) {
			quoteSeq += 1;
			let id = "";
			try { id = crypto.randomUUID(); } catch { id = `fi-quote-${Date.now().toString(36)}-${quoteSeq}`; }
			return { id, text, kind, sourceLabel };
		}

		// ---- 发送合并：ConversationController.sendSession 实例级补丁 ----

		const QUOTE_PATCH_KEY = "__fiQuoteSendPatch";

		/**
		 * 从 sendSession 的 session 参数提取会话 id：resident session face 的快照带
		 * id；拿不到就退回「当前会话」——只有可见会话的 composer 能提交，这个
		 * 回退在 UI 语义下总是正确的。
		 */
		function quoteSessionIdOf(session, sessions) {
			try {
				const id = session?.getSnapshot?.()?.id;
				if (typeof id === "string") return id;
			} catch { /* fallthrough */ }
			try {
				const current = sessions?.list?.getSnapshot?.().current;
				if (typeof current === "string") return current;
			} catch { /* fallthrough */ }
			return null;
		}

		/** 包一层 sendSession：有引用时先取走、拼块、再调原实现；失败把引用还回去。 */
		function quoteWrapSendSession(service, sessions) {
			const original = service.sendSession;
			const wrapped = function sendSessionWithQuotes(session, text, attachmentIds, mode, signal) {
				const sessionId = quoteSessionIdOf(session, sessions);
				const quotes = sessionId === null ? [] : quoteStore.take(sessionId);
				if (quotes.length === 0) return original.apply(this, arguments);
				const outcome = original.call(this, session, appendQuoteBlock(text, quotes), attachmentIds, mode, signal);
				if (outcome !== null && typeof outcome.catch === "function") {
					// 发送失败（如凭据缺失被 host 拒）时引用随草稿一起回来，chip 不丢。
					outcome.catch(() => { quoteStore.restore(sessionId, quotes); });
				}
				return outcome;
			};
			service[QUOTE_PATCH_KEY] = { original, wrapped };
			service.sendSession = wrapped;
		}

		/**
		 * 探测并确保补丁就位。conversation 服务由 dsh 客户端模块在启动时注册，
		 * 可能晚于本模块——失败可无限重试（一次探测只是两次 Map 查找）。
		 * @returns {boolean} 补丁是否就位；false = dsh 内部结构已变，功能应隐藏。
		 */
		function ensureQuoteSendPatch(ctx, sessions) {
			let service = null;
			try { service = ctx.get("conversation") ?? null; } catch { service = null; }
			if (service === null) {
				try {
					const current = sessions?.list?.getSnapshot?.().current;
					const actx = typeof current === "string" ? sessions?.scope?.(current) : undefined;
					service = actx?.get?.("conversation") ?? null;
				} catch { service = null; }
			}
			if (service === null || typeof service.sendSession !== "function") return false;
			const patch = service[QUOTE_PATCH_KEY];
			if (patch === undefined || service.sendSession !== patch.wrapped) {
				// 首次包裹，或 dsh 侧把方法指回过别的实现（服务实例被重建等）——重新包。
				quoteWrapSendSession(service, sessions);
			}
			return true;
		}

		// ---- 选区检查（DOM） ----

		/**
		 * 把当前 Selection 解析成悬浮菜单快照（对齐 ZCode inspectSelection）：
		 * null=不弹、error:single=超长提示、否则带选区矩形与文本/流类型。
		 * 控件门禁只看两个端点——克隆整段 Range 会把 DOM 顺序里夹着的装饰性
		 * 控件一并带上，据此判断会把合法正文误判成控件选区。
		 */
		function inspectQuoteSelection(doc) {
			// 对话区滚动容器可能有多个实例（预览面板等），任意一个包含选区即可
			const scrolls = [...doc.querySelectorAll("[data-conversation-scroll]")];
			const view = scrolls.length === 0 ? null : doc.defaultView ?? null;
			const selection = view === null ? null : view.getSelection();
			if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) return null;
			const range = selection.getRangeAt(0);
			const startElement = range.startContainer instanceof Element
				? range.startContainer
				: range.startContainer?.parentElement ?? null;
			const endElement = range.endContainer instanceof Element
				? range.endContainer
				: range.endContainer?.parentElement ?? null;
			if (startElement === null || endElement === null) return null;
			const excluded = Boolean(
				startElement.closest(QUOTE_EXCLUDED_SELECTOR) || endElement.closest(QUOTE_EXCLUDED_SELECTOR),
			);
			const startFlow = startElement.closest("[data-chat-flow-kind]");
			const endFlow = endElement.closest("[data-chat-flow-kind]");
			const kind = startFlow === null ? null : QUOTE_FLOW_KINDS[startFlow.getAttribute("data-chat-flow-kind")] ?? null;
			const text = selection.toString().trim();
			const rect = range.getBoundingClientRect();
			const guard = quoteGuardCandidate({
				enabled: scrolls.length > 0,
				sameFlow: startFlow !== null && startFlow === endFlow,
				insideTimeline: startFlow !== null && scrolls.some((scroll) => scroll.contains(startFlow)),
				excluded,
				supportedKind: kind !== null,
				text,
				hasLayout: rect.width > 0 || rect.height > 0,
			});
			if (guard === "ineligible") return null;
			const position = { center: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom };
			if (guard === "single-limit") return { ...position, text: null, kind: null, error: "single" };
			return { ...position, text, kind, error: null };
		}

		// ---- 组件 ----

		/** 订阅引用池（快照引用稳定；useSyncExternalStore 缺席时手动订阅等价）。 */
		function useQuoteRecord(sessionId) {
			const getSnapshot = react.useMemo(() => () => quoteStore.record(sessionId), [sessionId]);
			const useExternal = react.useSyncExternalStore;
			if (useExternal !== undefined) return useExternal(quoteStore.subscribe, getSnapshot);
			const [value, setValue] = react.useState(getSnapshot);
			react.useEffect(() => {
				setValue(getSnapshot());
				return quoteStore.subscribe(() => setValue(getSnapshot()));
			}, [getSnapshot]);
			return value;
		}

		/**
		 * 选区悬浮菜单：定位算法对齐 ZCode SelectionActionMenu——选区上方 8px
		 * 优先、放不下放下方、左右 clamp 到视口 12px 边距，ResizeObserver 跟随
		 * 自身尺寸重算。onPointerDown/onMouseDown preventDefault：点菜单不能
		 * 让浏览器折叠选区。
		 */
		function QuoteSelectionMenu({ snap, t, onAdd }) {
			const ref = react.useRef(null);
			react.useLayoutEffect(() => {
				const menu = ref.current;
				if (menu === null) return;
				const position = () => {
					const rect = menu.getBoundingClientRect();
					menu.style.left = `${Math.max(12, Math.min(window.innerWidth - rect.width - 12, snap.center - rect.width / 2))}px`;
					const preferredTop = snap.top - rect.height - 8 >= 12 ? snap.top - rect.height - 8 : snap.bottom + 8;
					menu.style.top = `${Math.max(12, Math.min(window.innerHeight - rect.height - 12, preferredTop))}px`;
				};
				position();
				const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
				observer?.observe(menu);
				return () => observer?.disconnect();
			}, [snap]);
			return jsx.jsx("div", {
				ref,
				"data-fi-quote-tooltip": "",
				className: "fi-quote-menu",
				style: { left: 12, top: 12 },
				onPointerDown: (event) => event.preventDefault(),
				onMouseDown: (event) => event.preventDefault(),
				children: snap.error === "single"
					? jsx.jsx("div", { className: "fi-quote-menu-note", children: format(t("quote.tooLong"), { n: QUOTE_LIMITS.single }) })
					: jsx.jsxs("button", {
						type: "button",
						className: "fi-quote-menu-action",
						"data-fi-quote-action": "add",
						onClick: onAdd,
						children: [icon(ICONS.quote, 14), t("quote.addToTask")],
					}),
			});
		}

		/**
		 * 选区监听（对齐 ZCode useTextSelection）：mouseup/touchend 触发、rAF
		 * 防抖、Escape/选区折叠/任意滚动/resize 关闭。probe 在产出合法候选时才
		 * 调用——sendSession 补丁打不上（dsh 改版）时菜单不出现，功能整体隐藏。
		 */
		function QuoteSelectionTooltip({ enabled, probe, onAdd, t }) {
			const [snap, setSnap] = react.useState(null);
			const frameRef = react.useRef(0);
			const close = react.useCallback(() => {
				window.cancelAnimationFrame(frameRef.current);
				setSnap(null);
			}, []);
			react.useEffect(() => {
				if (!enabled) {
					close();
					return;
				}
				const schedule = () => {
					window.cancelAnimationFrame(frameRef.current);
					frameRef.current = window.requestAnimationFrame(() => {
						const candidate = inspectQuoteSelection(document);
						setSnap(candidate !== null && probe() ? candidate : null);
					});
				};
				const onKey = (event) => (event.key === "Escape" ? close() : schedule());
				const onSelectionChange = () => {
					if (document.getSelection()?.isCollapsed ?? true) close();
				};
				document.addEventListener("mouseup", schedule);
				document.addEventListener("touchend", schedule, { passive: true });
				document.addEventListener("keyup", onKey);
				document.addEventListener("selectionchange", onSelectionChange);
				document.addEventListener("scroll", close, { passive: true, capture: true });
				window.addEventListener("resize", close);
				return () => {
					window.cancelAnimationFrame(frameRef.current);
					document.removeEventListener("mouseup", schedule);
					document.removeEventListener("touchend", schedule);
					document.removeEventListener("keyup", onKey);
					document.removeEventListener("selectionchange", onSelectionChange);
					document.removeEventListener("scroll", close, true);
					window.removeEventListener("resize", close);
				};
			}, [enabled, close, probe]);
			if (snap === null) return null;
			return reactDom.createPortal(
				jsx.jsx(QuoteSelectionMenu, { snap, t, onAdd: () => { onAdd(snap); close(); } }),
				document.body,
			);
		}

		/**
		 * 引用 chip（conversation.input.dock 槽位，输入框正上方；sessionId 是槽位
		 * 标准属性）。收起态只显示计数 pill，展开逐条预览（3 行截断）+ 单条移除 +
		 * 全部清除；note 显示上次添加失败的原因。
		 *
		 * 对齐：输入卡片（data-composer-card）居中限宽且可拖宽，槽位容器是全宽
		 * 的——不对齐 chip 会贴到对话区左缘（第一版就是这样）。这里把内容缩进到
		 * 卡片左缘，ResizeObserver 跟随卡片宽度变化；找不到卡片时保持原样。
		 */
		function QuoteDock({ sessionId, t }) {
			const translate = typeof t === "function" ? t : (key) => key;
			const record = useQuoteRecord(sessionId);
			const [open, setOpen] = react.useState(false);
			const rootRef = react.useRef(null);
			react.useEffect(() => { setOpen(false); }, [sessionId]);
			const hasContent = record.quotes.length > 0 || record.note !== null;
			react.useEffect(() => {
				if (!hasContent) return;
				const el = rootRef.current;
				if (el === null) return;
				const findCard = () => {
					let scope = el.parentElement;
					for (let i = 0; i < 4 && scope !== null; i++) {
						const card = scope.querySelector("[data-composer-card]");
						if (card !== null) return card;
						scope = scope.parentElement;
					}
					return null;
				};
				// 反馈式对齐：量 chip 与卡片左缘的实际差值、迭代缩进。挂载瞬间
				// 对话区布局可能还没 settle（首帧读数即错），靠 rAF 连续收敛到
				// 稳态；之后的拖拽调宽由 ResizeObserver 兜住。
				const align = () => {
					const card = findCard();
					if (card === null) {
						el.style.paddingLeft = "";
						return;
					}
					const chip = el.querySelector(".fi-quote-chip");
					if (chip === null) return;
					const delta = card.getBoundingClientRect().left - chip.getBoundingClientRect().left;
					if (Math.abs(delta) <= 1) return;
					el.style.paddingLeft = `${Math.max(0, parseFloat(el.style.paddingLeft || "0") + delta)}px`;
				};
				let frame = 0;
				let rafId = 0;
				const tick = () => {
					align();
					frame += 1;
					if (frame < 12) rafId = window.requestAnimationFrame(tick);
				};
				tick();
				const card = findCard();
				const observer = typeof ResizeObserver === "undefined" || card === null ? null : new ResizeObserver(align);
				observer?.observe(card);
				window.addEventListener("resize", align);
				return () => {
					window.cancelAnimationFrame(rafId);
					observer?.disconnect();
					window.removeEventListener("resize", align);
				};
			}, [sessionId, hasContent]);
			if (typeof sessionId !== "string" || !hasContent) return null;
			const note = record.note === null ? null
				: record.note === "single" ? format(translate("quote.tooLong"), { n: QUOTE_LIMITS.single })
					: record.note === "count" ? format(translate("quote.limit.count"), { n: QUOTE_LIMITS.count })
						: translate("quote.limit.total");
			return jsx.jsxs("div", { ref: rootRef, className: "fi-quote-dock", "data-fi-quote-dock": "", children: [
				jsx.jsxs("button", {
					type: "button",
					className: "fi-quote-chip",
					"aria-expanded": open ? "true" : "false",
					"data-fi-quote-count": record.quotes.length,
					onClick: () => setOpen((value) => !value),
					children: [
						icon(ICONS.quote, 13),
						format(translate("quote.count"), { n: record.quotes.length }),
						icon(open ? ICONS.quoteCollapse : ICONS.quoteExpand, 13),
					],
				}),
				note !== null ? jsx.jsx("div", { className: "fi-quote-note", children: note }) : null,
				open && record.quotes.length > 0 ? jsx.jsxs("div", { className: "fi-quote-list", children: [
					...record.quotes.map((quote) => jsx.jsxs("div", { className: "fi-quote-item", children: [
						jsx.jsx("div", { className: "fi-quote-item-text", title: quote.text, children: quote.text }),
						jsx.jsx("button", {
							type: "button",
							className: "fi-quote-remove",
							"aria-label": translate("quote.remove"),
							onClick: () => quoteStore.remove(sessionId, quote.id),
							children: icon(ICONS.quoteRemove, 13),
						}),
					] })),
					record.quotes.length > 1 ? jsx.jsx("button", {
						type: "button",
						className: "fi-quote-clear",
						onClick: () => quoteStore.clear(sessionId),
						children: translate("quote.clear"),
					}) : null,
				] }) : null,
			] });
		}
		//#endregion

		//#region plugin
		const inject = ["slots", "locale", "uiWorkspace", "workspaces", "sessions"];

		function apply(ctx) {
			const uiWorkspace = ctx.get("uiWorkspace");
			const workspaces = ctx.get("workspaces");
			const sessions = ctx.get("sessions");

			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "fi-sidebar: dictionaries");

			// Finder 深链打开（主进程投递）时压制下方启动钉子：钉子会在 default
			// 晚到时把「default 之外的空白会话」改钉回 default，恰好吃掉深链刚
			// 切过去的文件夹工作区（用户实测：闪切到文件夹一秒后被钉回 default）。
			// 钉子先落定、深链后到时不受影响，两种时序终态都是目标文件夹。
			let finderOpenActive = false;
			// 深链守位句柄（重复投递时旧守位先撤，见 onOpen）。
			let activeFinderGuard = null;

			ctx.effect(() => {
				// 启动钉子：dsh 原生 watchNavigation 在无当前会话时按「最近活动」挑
				// 初始工作区，冷启动可能落在 Applications 这类历史工作区；fi 的语义是
				// 每次启动都停在 default 工作区的新任务页。两家并发 connect 时 dsh
				// 只在 current 仍为空时才 open（见 ui-workspace.reconcile），终态恒为
				// default，无需抢时序。default 由服务端半层异步 ensure，晚到时等下
				// 一个快照再钉；期间 dsh 若已兜底在别处开了空白会话，一并改钉。
				let armed = true;
				const pin = () => {
					if (!armed || finderOpenActive) return;
					const workspace = workspaces.list.getSnapshot();
					const sessionList = sessions.list.getSnapshot();
					if (workspace.phase !== "ready" || sessionList.phase !== "ready") return;
					const target = workspace.items.find((w) => w.title === DEFAULT_WORKSPACE_TITLE);
					if (target === undefined) return;
					const current = sessionList.current;
					armed = false;
					// 只在无当前会话，或当前是开在 default 之外的空白会话时出手；
					// 用户已在真实会话上则不动。
					if (current !== undefined && (target.sessionIds.includes(current) || sessionList.byId[current]?.blank !== true)) return;
					uiWorkspace.startSession(target.workspaceId);
				};
				const disposeWorkspaces = workspaces.list.subscribe(pin);
				const disposeSessions = sessions.list.subscribe(pin);
				pin();
				return () => {
					disposeWorkspaces();
					disposeSessions();
				};
			}, "fi-sidebar: boot into default workspace");

			// Host 内容搜索（SQLite FTS 全文搜会话消息）。仿 dsh ui-workspace 的
			// Result 解包：服务层返回 {ok,value}/{ok,error}，UI 侧统一成 Promise。
			const searchSessions = async (query, signal) => {
				const result = await sessions.search(query, signal);
				if (!result.ok) throw new Error(result.error.message);
				return result.value;
			};

			const startNewTask = () => {
				// 服务端半层通常已建好 default 工作区；极端情况下（未就绪/建区失败）
				// 退化为 dsh 原生行为：继承当前/最近工作区。
				const ws = workspaces.list.getSnapshot().items.find((w) => w.title === DEFAULT_WORKSPACE_TITLE);
				uiWorkspace.startSession(ws === undefined ? undefined : ws.workspaceId);
			};
			const openSession = (sessionId) => uiWorkspace.openSession(sessionId);
			/**
			 * 项目模式核心动作：在所选文件夹里新建任务。workspaces.create 幂等
			 * （已是工作区的目录原样返回并立即合入客户端投影），startSession 复用
			 * 该工作区里未发送过消息的 blank 会话，否则新建，然后在右侧打开。
			 * 返回 null 或用户可读的错误信息（浏览器行内提示）。
			 */
			const startNewTaskIn = (dirPath) => workspaces.create({ path: dirPath })
				.then((ws) => {
					uiWorkspace.startSession(ws.workspaceId);
					return null;
				})
				.catch((err) => err?.message ?? String(err));

			// Finder 服务 / fi:// 深链投递（主进程 finder-open.ts 经 preload 队列）：
			// 与项目模式「在文件夹里新建任务」同一动作；浏览器直开 dsh（无
			// window.fi 桥）或插件降级时静默跳过，主进程留存待重投。回执只在
			// 动作完成后发（成功 null / 失败带错误文案），主进程据此清账或重投。
			// 落地即压制启动钉子（见上方 finderOpenActive 注释），成功后守位
			// （guardFinderOpen）防 dsh 一次性启动恢复把我们翻回 default。
			if (typeof window !== "undefined" && window.fi?.openWorkspace) {
				window.fi.openWorkspace.onOpen((dirPath) => {
					finderOpenActive = true;
					workspaces.create({ path: dirPath })
						.then((ws) => {
							uiWorkspace.startSession(ws.workspaceId);
							if (activeFinderGuard !== null) activeFinderGuard();
							activeFinderGuard = guardFinderOpen({ workspaces, sessions, uiWorkspace }, ws);
							return null;
						})
						.catch((err) => err?.message ?? String(err))
						.then((err) => window.fi.openWorkspace.ack(dirPath, err));
				});
			}

			// 选区引用（0.6）：探测/确保 sendSession 补丁就位。conversation 服务由
			// dsh 客户端模块注册，可能晚于本模块——probe 在每次合法选区时重试，
			// 一直失败（dsh 改版）则菜单永不出现，功能整体静默隐藏。
			const quoteProbe = () => ensureQuoteSendPatch(ctx, sessions);

			ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({
				name: "sidebar.workspaces",
				priority: -1,
				inject: () => ({ startNewTask, startNewTaskIn, openSession, searchSessions, searchResultLimit: sessions.searchResultLimit, quoteProbe }),
				locale: NS,
			}, FiSidebarRegion));

			// 引用 chip 挂进官方输入框上方槽位（list 型，与 todo/queue dock 同列、
			// 不顶替任何宿主内容）；sessionId 是槽位标准属性。
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "fi-quotes",
				order: 10,
				locale: NS,
			}, QuoteDock));

			// 去掉 logo 行的「deepseek HARNESS」文字标。sidebar.brand.name 是
			// single 槽位（官方约定可替换，文字只是 shell 的 fallback）：注册空
			// 渲染即整块接管，小鱼图标（brand.mark）与收起按钮不受影响，文字
			// 也不会再进无障碍树（区别于 CSS 隐藏）。
			ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register({
				name: "sidebar.brand.name",
				priority: -1,
			}, () => null));
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
