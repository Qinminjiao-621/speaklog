# V3 升级安全检查与备份确认暂停点

日期：2026-11-13。当前只完成升级前准备，尚未开发、提交、推送或发布 V3。

## 代码与部署基线

- 检查前工作区干净，分支 main；无需要保存的未提交源码修改。
- 本地 HEAD、origin/main、通过 GitHub API 查询的远程 main 均为 `06f48184deb741cff58cdb1ee38b4d800942bb06`。
- 对应 [GitHub Pages 工作流](https://github.com/Qinminjiao-621/speaklog/actions/runs/43376859934) 已完成，build 和 deploy 均 success。
- 现有测试 111/111 通过；TypeScript 检查、生产构建通过。
- 已建立本地附注标签 `speaklog-v2.0-before-v3-20261113`，未推送。
- 完整已跟踪源码快照：`backups/v2-before-v3-20261113/source.tar.gz`。
- 完整 Git 历史及标签：`backups/v2-before-v3-20261113/history.bundle`，`git bundle verify` 通过。
- 上述文件均被 Git 忽略，仅包含源码及 Git 历史，不包含 iPhone 个人笔记；依赖由 lockfile 重建，构建产物无需作为源码备份。
- source.tar.gz SHA-256：`ab919220a29cb31db7e90c39c6dd83e9a825c22fd3069688949d833fd1f2b54e`。
- history.bundle SHA-256：`222c6ebde107f52677e6c32878150c20acfff3ce1f83a74f29813e5728be30bc`。

## 实际 V2 实现与 V3 约束

- IndexedDB：数据库 speaklog，数据库版本 1，app 对象仓库。state 为保留的 V1，state-v2 为当前 V2；数据模型 dataVersion: 2，完整备份 backupVersion: 2，英文内容 schemaVersion: 1，版本不能混用。
- 笔记本 id 与笔记 uid 稳定；笔记导入 id 独立于 uid；Day 只在本内唯一。
- 迁移及写入采用 readwrite 事务，异常 abort；保存校验 revision 防止过期页面覆盖，检查旧 V1 指纹防止两代应用并行写入。保留迁移、上次保存及上次恢复前快照。
- 导入支持单篇、数组、notes 容器及旧英文兼容字段；预览新增/更新后确认。Day 与导入 id 指向不同身份时整批拒绝。
- 编辑保留内部身份；移动检查编号冲突；非空本删除需两次确认，显示名称和篇数。
- 首页目前有全局搜索，V3 必须移除；本内搜索空查询显示七列数字圆圈。排序存数据库，历史保存本、查询及滚动位置；详情有边缘右滑返回及顶部返回。
- PWA 使用 prompt 等待更新，不强制 skipWaiting 或刷新编辑页。Vite base、manifest start_url/scope 均为 /speaklog/，保持来源及作用域不变。
- main 推送或 workflow_dispatch 会触发现有测试、类型检查、构建与 Pages 部署；未经用户明确批准不得触发。
- V3 计划另存 state-v3，在同一事务内校验、保留 V2 快照并建立旧状态指纹；保留全部 V2 原键、笔记本 id、笔记 uid 和英文内容。首次中文分类为空；语言成为笔记本稳定属性；重启只加载已有 V3。
- V3 恢复必须合并预览，不清空现有内容；跨语言移动及笔记本身份/语言冲突必须拒绝。
- 现有自动化数据库测试使用 Node fake-indexeddb；即使旧测试含 deleteDB，也仅作用于内存，不连接真实浏览器数据库。

## 当前待办与确认门槛

1. 用户从原 iPhone PWA 导出当前 V2 全量 JSON，保存 iCloud Drive / SpeakLog，同步到 Mac，提供本地路径。不得将私人备份复制进项目。
2. 使用 `node scripts/check-v2-source-backup.mjs "备份完整路径"` 只读校验；脚本不依赖 Day 01–05，检查完整字段、身份、数量、真实日期、内存恢复、重读、导出往返、重复恢复和原文件未变，仅报告数量及校验摘要。现有 check-v2-backup.mjs 实际针对 V1 输入，不能代替此步骤。
3. 本次尚未获得真实 V2 备份路径或确认，不能宣称个人笔记已验证。用户确认备份已保存、校验通过后继续 V3 开发及隔离迁移测试。
4. 完成本地验收后再次暂停，等待用户明确回复“本地验收通过，可以发布 V3”，才可提交推送正式部署分支。
5. 发布成功须核对 Actions 与线上资源，之后由用户验收原 iPhone PWA。不得卸载、清除 Safari 数据或清库。

代码回退不会自动回退 IndexedDB。发生异常先停止编辑、导出安全副本、保留各版本数据，再在隔离环境分析恢复。

## 后续进展：真实备份校验与本地开发

用户提供当前 iCloud V2 JSON 路径后，已只读校验 1 本、5 篇、23 条句子、15 条纠错；V2 恢复、V3 隔离迁移及恢复、文件字节未变均通过。未复制私人文件或正文到项目。

现已完成独立 V3 开发，详细结果和发布门槛见 [v3-local-acceptance.md](v3-local-acceptance.md)。顶部“尚未开发”为本记录建立时的历史状态，以本节为当前状态。本人完整备份确认及本地验收发布批准仍待用户明确回复；未提交、推送或发布 V3。

## 正式发布授权

用户已明确回复：“备份确认完整，本地验收通过，可以发布 V3。”

备份完整性与本地验收门槛已满足，允许提交并正常推送现有 main 分支，通过原 GitHub Actions 部署。保留 Git 历史及 V2 回退标签，发布后继续核对工作流、线上资源与 PWA 作用域。iPhone 真机验收仍须用户在原主屏幕应用中执行。
