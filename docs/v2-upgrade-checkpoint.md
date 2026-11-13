# SpeakLog V2 升级检查记录

## 2026-11-13：V1 基线及暂停点

- 检查前 Git 工作区干净，无用户未提交修改。
- 当前 main 与线上成功部署均为 `23c7998e396ec787937669181de618bc0e2c1d08`。
- 线上部署记录：https://github.com/Qinminjiao-621/speaklog/actions/runs/43178273858
- 原有 22 项自动化测试通过；`npm run typecheck` 和 `npm run build` 通过。
- 本地已建立附注标签 `speaklog-v1.0-before-v2-20261113`。
- 完整 Git 历史备份：`backups/speaklog-v1.0-before-v2-20261113.bundle`，已通过 `git bundle verify`。
- `backups/` 已被 Git 忽略。该 bundle 只含代码历史，不包含 iPhone 笔记。
- 尚未获得用户的 iPhone 完整备份确认，也未校验真实备份。
- 未修改应用行为、执行真实数据迁移、推送或发布 V2。

## 实际 V1 架构

- React 19、TypeScript、Vite，`idb` 包装 IndexedDB。
- IndexedDB 数据库 `speaklog`，数据库版本 1，对象仓库 `app`，键 `state` 保存 `{ notes: [...] }`。
- 首次写入前保存 `legacy-state-before-simplification`，已有快照不覆盖。加载时只在内存转换旧格式。
- 笔记 `schemaVersion: 1`，当前全局用 `id` 合并，无笔记本字段，无 Day 唯一约束。
- JSON 支持单篇对象、数组、`{ notes: [...] }`。V1 完整备份使用 `backupVersion: 1`。
- 页面使用 React 状态导航，未实现浏览器历史及列表滚动恢复。
- PWA `registerType: 'prompt'`，不强制跳过等待；使用预缓存静态文件。
- Vite base、PWA start_url/scope 均为 `/speaklog/`，必须保留。
- 现有 main 推送通过 GitHub Actions 测试、构建后发布 dist。

## 用户备份步骤

1. 在 iPhone 原来的 SpeakLog 中导出全部笔记。
2. 保存至 iCloud Drive 的 SpeakLog 文件夹，打开文件确认可读取，保留原件。
3. 将备份同步到 Mac，提供其本地完整路径；不要放入 `public/` 或 `src/`。如需复制进项目，只使用已忽略的 `private-data/` 或 `backups/`。
4. 运行独立校验：

   ```sh
   node --experimental-strip-types scripts/check-v1-backup.mjs "备份文件的完整路径"
   ```

   此脚本使用当前 V1 校验逻辑和 Node 进程内的 fake-indexeddb，检查全量格式、Day 01–05、重复 Day、写入重读及导出往返一致性。仅输出数量、Day 编号和文件 SHA-256，不打印正文、不修改备份、不接触浏览器数据库、不上传任何内容。它验证 V1 备份可用性，不能替代尚未实现的 V2 迁移测试。V2 修改数据层时须同步维护该工具。
5. 由用户明确确认备份完成；随后进行开发及隔离测试。正式发布仍须本地验收通过和用户另行确认。

## 后续实现需守住的边界

- 保留现有数据库来源和 V1 原始快照；迁移必须原子提交、幂等，失败不能覆盖原始状态。
- 稳定内部笔记 ID 与导入 ID 分离；Day 唯一性限制在笔记本内；跨笔记本不可静默覆盖。
- V1 允许不同 ID 使用同一个 Day；发现旧数据冲突应停止迁移并保留原始数据，不能自动丢弃或改写用户内容。
- 多标签页和旧 PWA 页面可能并存，需要处理旧版写入及过期状态，不能依赖用户恰好只开一个页面。
- 回退标签恢复的是代码，不会自动恢复数据库。迁移后不能仅发布 V1 就假定 V2 数据可读。部署前必须验证数据回退方案，并保留升级前备份及升级后全量备份。
- 不卸载 PWA、不清除 Safari 数据、不删除数据库、不 force push。

## 2026-11-13：备份确认后的进展

用户已明确确认 iCloud 完整备份存在且可读取。经只读文件检查和 Node 内存 IndexedDB 恢复验证通过后，开始 V2 开发。V2 开发与测试结果及发布门槛记录在 `v2-local-acceptance.md`。私人文件仍在原位置，未复制到源码、public 或正式网站；未执行任何真实 iPhone 数据操作。正式发布授权仍待用户本地验收后另行给出。

## 2026-11-13：发布授权

用户明确确认本地验收通过并同意发布 V2。发布继续使用原仓库 main 和原 GitHub Pages 地址，不强制推送、不操作真实 iPhone 数据。部署完成后仍需用户进行真机升级验收。
