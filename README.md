# SpeakLog V2.0

个人英语口语笔记本，适配 iPhone 主屏幕 PWA。收录 ChatGPT 整理的每日笔记，按笔记本和 Day 浏览，支持中英文全文搜索、编辑、移动及完整备份。笔记只保存在当前设备的 IndexedDB，没有账号、后端或自动上传。

沿用 React、TypeScript、Vite、idb 与 GitHub Pages。生产地址保持为 https://qinminjiao-621.github.io/speaklog/ 。V2 已通过本地验收并获得用户发布授权；实际发布结果以仓库 GitHub Actions 和线上验证为准。

## 本地运行

需要 Node.js 22.12 或更高版本。

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
```

生产预览：http://127.0.0.1:4175/speaklog/ 。绑定回环地址，仅这台 Mac 可访问。开发模式使用 `npm run dev`。预览端口与域名共同决定浏览器存储，和正式网站完全隔离；不要将不同地址的空数据库误认为真实笔记丢失。验收建议用无痕窗口和模拟笔记。

## 功能

- 首页默认仅一本“采购职场英语”，无示例笔记。可新建、重命名、删除；名称去除首尾空格，Unicode 正规化和大小写比较后不能重复。空本删除一次确认，非空本两次确认并显示名称与真实篇数。
- 笔记本内每行 7 个 Day 圆圈，只列出实际存在的笔记，无缺号占位。顶部 `+` 支持手动新增或 JSON 导入；正序/倒序保存到数据库。
- 首页全局搜索，笔记本内局部搜索。输入查询后显示精简结果和命中片段，全局结果注明归属。英文不区分大小写；`Day 15`、`day15`、`15` 均精确匹配编号 15，纯数字不用于模糊匹配正文。
- 详情使用紧凑英文/中文上下排版和浅色分隔线；纠错只显示原始表达 → 正确表达。旧版无法确定对应关系的纠错仍保留原文。
- 详情 `···` 支持编辑、移动、删除。移动保留内部身份、内容及日期；编号冲突时建议可用 Day，不能覆盖目标。标题中的旧 Day 字样不自动改写。
- 顶部返回和浏览器历史记录共用导航，恢复原搜索、笔记本及滚动位置。详情左侧 24px 内的短时水平右滑可返回；长按、选中文字、控件、多指、垂直滚动、非边缘起手不会触发自定义返回。首页不注册该手势。

## JSON 导入

继续接受 `schemaVersion: 1` 单篇、数组和 `{ "notes": [...] }`，不需要额外填写笔记本字段：导入到当前打开的笔记本。

```json
{
  "schemaVersion": 1,
  "id": "day-01",
  "day": 1,
  "date": "2026-01-01",
  "title": "Day 01｜日常问候",
  "topic": "日常问候",
  "sentences": [{ "id": "s01", "en": "Good morning.", "zh": "早上好。" }],
  "mistakes": []
}
```

纠错条目为 `{ "id": "m01", "original": "错误表达", "corrected": "正确表达" }`。不要求 reason、explanation、tip 或 summary。兼容旧字符串纠错及已有 tip、summary、example、legacyMistakes 字段，不丢弃这些兼容数据。

导入先整批校验，再预览新增、更新数量和将被替换的笔记。用户确认后一次事务保存；取消不保存。同一本内按 Day 或原导入 ID 匹配，保留稳定内部 UID；若二者指向不同笔记，或同批存在重复 Day、多次更新同一身份，则拒绝整批。不同笔记本的相同 Day 和原导入 ID 互不覆盖。

沿用 V1 校验限制：Day 为 1–10000 的整数、真实日期、非空文本、每篇 1–500 句、普通导入最多 1000 篇；完整备份和累计存储不受单批数量限制。内容以纯文本显示。

## 数据模型与安全迁移

IndexedDB **数据库名 `speaklog`、数据库版本 1、对象仓库 `app` 保持不变**。这里的数据库版本与备份格式版本、数据模型版本彼此独立。

V2 使用新键 `state-v2` 存储：

- `dataVersion: 2`、单调增加的 `revision`、全局 `order`（asc / desc）；
- `notebooks: [{ id, name }]`；
- `notes: [{ ...V1笔记字段, uid, notebookId }]`。

笔记本 ID 和笔记 UID 均稳定，Day 只在本内唯一。导入 JSON 原有 `id` 保留，独立于内部 UID。删除全部笔记本后重开不会擅自重新创建。

首次加载时，在同一个 readwrite 事务中读取、校验 V1 的 `state`，保存 `v1-before-v2` 原始快照和旧状态指纹，生成 V2。旧笔记全部归入默认本，UID 根据旧 ID 稳定生成。**V2 不覆盖 V1 的 `state`，也不改写旧的 `legacy-state-before-simplification`**。校验失败、重复 Day 或写入失败均中止事务；不删除数据库或对象仓库。后续启动只读取并验证已有 V2，迁移幂等。

保存时再次检查持久化 revision，拒绝过期页面覆盖其他页面；同时检查 V1 指纹，发现旧应用页面写入则停止 V2 写入并提供安全副本导出，保留双方数据供核对。每次保存前保留 `v2-before-last-save`，恢复前额外保留 `v2-before-last-restore`。这些内部快照不能替代 iCloud 文件备份。

## 备份和恢复

设置 → “导出全部笔记本”：导出 `backupVersion: 2`，包含所有笔记本、内容、内部 ID、归属及排序。请确认文件已保存到 iCloud Drive 并可读取。

“从备份合并恢复”支持 V1 和 V2：

- V1 笔记放入名称为“采购职场英语”的本。如果原默认本被改名，则创建该名称的新本，不覆盖已改名本。
- V2 笔记本按 ID 优先、同名其次匹配，保留现有名称；不存在时新增。同一本内按 UID 或 Day 匹配。
- 恢复前明确列出新增/更新，确认后合并，同匹配笔记被备份整篇替换，其他笔记保留；空备份不会清空现有笔记。
- 身份跨本、身份与 Day 指向不同笔记、多个备份笔记本映射到同一本等歧义直接拒绝，避免静默覆盖。
- “导出安全副本”用于异常排查，包含当前 V1/V2 原始状态和快照，使用 `recoveryVersion: 1`；它不是普通导入文件，需人工核对转换。

私密备份校验（只读文件，在 Node 的 fake-indexeddb 内存环境中测试，不接触浏览器数据库）：

```sh
node --experimental-strip-types scripts/check-v1-backup.mjs "本地V1备份路径"
node scripts/check-v2-backup.mjs "本地V1备份路径"
```

这两个升级校验脚本针对已有 Day 01–05 的升级场景，会检查缺失编号。第二个脚本验证 V2 迁移、内容一致性、重复加载、V1/V2 恢复、V1 原始状态保留和文件未变；输出只包含数量、编号和摘要校验值，不输出私人正文。

## PWA 和 iPhone 升级

保持原域名、`/speaklog/`、start_url 和 scope。Service Worker 继续使用等待更新策略，不设置 skipWaiting/clientsClaim 强制接管，不在阅读或编辑中自动刷新。构建预缓存同一版本的 HTML/JS/CSS，只有旧页面都关闭后新 Worker 才接管。

正式部署成功后：

1. 保留已验证的升级前 JSON，结束未保存输入。
2. 联网打开原来的主屏幕 SpeakLog，给应用时间下载更新；保存输入，关闭所有 SpeakLog PWA/Safari 页面，再打开。必要时再进行一次开关流程，不卸载、不清除 Safari 数据。
3. 确认首页显示 V2.0，“采购职场英语”内旧 Day 01–05 完整、日期与内容不变。
4. 打开旧笔记并用中英文、Day 编号搜索；切换排序后关闭重开。
5. 新建测试笔记本，导入一篇独立 Day 01；再导入同 Day，核对更新预览并测试取消。
6. 从搜索结果进入详情，使用顶部返回和左边缘右滑，核对搜索、滚动、排序和归属恢复；检查正常上下阅读、复制和输入不受干扰。
7. 关闭重开后确认保存，导出新的 V2 全量备份。首次完整缓存后再验证离线打开。

自动化通过不等于 iPhone 真机通过。iOS 主屏幕更新、边缘手势与 Safari 原生历史协作、文件保存和离线行为仍需用户真机验收。

## 发布与回退

当前仓库 `Qinminjiao-621/speaklog` 的 `main` 推送继续走 `.github/workflows/deploy.yml`：npm ci → 测试 → 类型检查 → 构建 → Pages 上传 → 部署。确认用户本地验收通过并同意发布后才能推送，不能 force push。发布成功须同时确认 Actions build/deploy 成功，以及线上 HTML、脚本、样式、manifest、Service Worker 可访问。

升级前代码回退标签：`speaklog-v1.0-before-v2-20261113`，指向 `23c7998e396ec787937669181de618bc0e2c1d08`。本地完整代码 bundle 位于已忽略的 `backups/`。

**代码回退不是数据回退。** V1 页面读取保留的旧 `state`，看不到 V2 新增或移动的笔记，但 V2 数据仍保留在 `state-v2`。发生问题应先导出 V2 全量备份及安全副本并停止编辑，优先修复 V2。若确需回退代码，应以新提交恢复经验证的 V1 文件，经过发布确认后正常推送，保留全部历史。回退后不要在 V1 和 V2 两边交替编辑；V1 新写入会触发 V2 指纹保护，须在隔离环境人工核对合并，不能清库重来。

## 测试与文件

- `src/data.ts`：保留 V1 校验及兼容工具；原有 22 项测试不变。
- `src/model.ts`：V2 模型、笔记本、导入计划、搜索、移动、备份恢复。
- `src/storage.ts`：原子迁移、快照、revision 和旧版写入保护。
- `src/navigation.ts`、`src/useNavigation.ts`：历史、列表位置和手势。
- `src/App.tsx`、`src/components/Editor.tsx`、`src/style.css`：界面及编辑器。
- `scripts/check-*-backup.mjs`：本地私密备份隔离校验。
- `docs/v2-local-acceptance.md`：本地验收记录和待确认事项。

隐私规则：不要将私人 JSON、备份或密钥放入 src/public；public 中的所有文件都会发布。`.gitignore` 排除私人 JSON、backups、private-data、环境和密钥文件、node_modules、dist 等。只逐个添加经审核的源码文件，禁止 `git add -f` 绕过排除规则。
