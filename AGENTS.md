# fi — 代理协作约定

本文件是放在仓库里的持久化规则，所有 AI 代理和贡献者必须遵守。

## 发版规则（必须遵守）

用户明确要求：**只要有新版本推送到 GitHub，必须同步更新 CHANGELOG.md，并创建对应的 GitHub Release**。执行标准：

1. 任何功能或修复合入 main 时，在 CHANGELOG.md 的 `[Unreleased]` 下补一条面向用户的说明（新增/变更/修复分类）。
2. 推送新版本之前：
   - 把 `[Unreleased]` 定版为新的版本号和日期；
   - 更新 package.json 的 `version` 为相同版本号；
   - 更新 CHANGELOG.md 底部的版本对比链接；
   - 以上内容与版本提交一起推送，不允许先推代码后补记录。
3. 版本号取向：bug 修复升补丁号（0.1.x），新功能升次版本号（0.x.0），破坏性变更升主版本号。
4. CHANGELOG 条目用中文，面向使用者描述「变了什么、对使用有什么影响」，不写实现细节流水账。
5. 每个版本必须创建 GitHub Release，只推 tag 不建 release 视为发版未完成：
   - tag 形如 `vX.Y.Z`，与 package.json、CHANGELOG 的版本号一致；
   - 标题 `fi X.Y.Z`，正文取自 CHANGELOG 对应版本段（中文、面向使用者），末尾补安装命令与介绍页链接；
   - 命令：`gh release create vX.Y.Z --title "fi X.Y.Z" --notes-file notes.md --verify-tag --latest`；
   - 有打包产物（dmg 等）时作为 assets 挂到同一个 release 上，不另建 release。

## 其他约定

- 架构与契约改动（spawn 参数、URL 握手解析、DOM 忙碌标记等）属于面向用户的变更，必须进 CHANGELOG。
- 提交信息用英文祈使句，一个主题一个提交；README 是架构与路线图的唯一权威文档，行为变化要同步。
