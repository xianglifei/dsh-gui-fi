# fi 官网（GitHub Pages）

`fi` —— dsh 的 Electron 桌面壳。这里是它的静态介绍页，GitHub Pages 从 `main` 分支的 `/docs` 目录发布。

## 文件

```
docs/
├── index.html      单页；语义化 section + 内联 SVG 图标
├── style.css       token、点阵画布、导航、卡片、模拟界面、响应式
├── app.js          导航吸顶、入场动画、章节高亮、复制命令
├── assets/icon.svg 站点图标
├── og.png          1200×630 分享图
├── .nojekyll       跳过 Jekyll
└── README.md       本文件
```

纯静态：没有构建、没有外部字体、没有运行时依赖。`docs/` 直接可服务。

## 本地预览

最省事的方式：**双击 `docs/index.html`**，浏览器直接打开，不需要起服务（页面没有 fetch / 外部资源，`file://` 完全够用；复制命令走 `execCommand` 兜底，同样可用）。

想模拟 GitHub Pages 的 `/<repo>/` 子路径时再起服务：

```bash
cd docs
python3 -m http.server 8765
```

打开 http://127.0.0.1:8765/ 。发布前的正式验收建议走 http（相对资源与剪贴板行为和线上一致）；只是自己看效果，双击文件就行。

## 发布

1. 合并到 `main`，保留 `docs/`；
2. 仓库 Settings → Pages → Deploy from a branch → `main` / `/docs`；
3. 等构建（30–90 秒），访问 https://xianglifei.github.io/dsh-gui-fi/ ；
4. 仓库 About → Website 填上面这个 URL；
5. 根目录 README 顶部加一行线上地址。

站点地址是 `/<repo>/`，所以所有资源都用相对路径（`assets/...`），不要写 `/assets/...`。

## 维护提示

- 版本号出现在导航下的 eyebrow、页脚与 JSON-LD 里，发版时一起改。
- 页面里的窗口与面板是 HTML/CSS 重绘的**界面示意**（figcaption 已标注），不是真实截图；换真实截图时把 `.appwin` 换成 `<img>`，并把标注改成「实际界面」。
- `og.png` 用 `assets/og-template.html` 渲染；改文案后重新截图（1200×630）。
- 文案事实来源：根目录 `README.md`、`CHANGELOG.md`、`docs/official-desktop-comparison.md`。
- 技能参照：`dsh-plugin-site`（视觉系统、内容蓝图、验收与发布链路）。
