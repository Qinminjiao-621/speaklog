# SpeakLog V3.0

个人学习与表达笔记库，适配 iPhone 主屏幕 PWA。首页分为英文笔记、中文笔记；在笔记本内浏览、搜索、编辑及导入内容。笔记只保存在当前设备 IndexedDB，没有账号、后端或自动上传。

沿用 React + TypeScript + Vite + idb + GitHub Pages。生产地址保持 https://qinminjiao-621.github.io/speaklog/ ，PWA start_url/scope 与 Vite base 均为 `/speaklog/`。V3 已通过用户本地验收并获得明确发布批准；实际部署结果以 GitHub Actions 和线上验证为准。

## 本地运行与测试

测试工具要求 Node.js 22.22.2+（22 系列）、24.15.0+（24 系列）或 26+。当前 Mac 使用 24.18.0；现有 GitHub Actions 使用最新 Node 22。

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run preview -- --host 127.0.0.1 --port 4183 --strictPort
# 保持预览运行；使用本机 Chrome 的全新临时上下文：
npm run test:e2e
```

本地访问：http://127.0.0.1:4183/speaklog/ 。仅当前 Mac 可访问，来源与正式网站隔离；空本地数据库不表示 iPhone 旧笔记丢失。优先用模拟笔记验收，不需把私人备份导入浏览器。Playwright 的截图与失败追踪位于 `/tmp/speaklog-v3-browser-results`，不进入仓库。

## 分类、笔记本与导航

- 首次显示英文；分类选择保存在 localStorage，重开保留。V2 旧本全部归英文，中文首次为空；不会创建额外空本。
- 新建继承当前分类。名称按首尾去空白、Unicode NFKC 和大小写比较，同语言不可重名；不同语言可同名，内部 ID 始终唯一。重命名不改变语言。
- 空本删除确认一次；非空本显示名称和篇数并确认两次。笔记删除另行确认。
- 首页没有搜索框。仅在当前本内搜索，空查询显示七列编号圆圈，只有实际笔记占位；正倒序存入数据库。
- 英文搜索标题、主题、日期、中英文句子和纠错；中文搜索标题与解析后的 Markdown 文本，支持跨加粗标记匹配。每篇仅显示一次。保留原有纯数字或 `Day 15` 精确查询编号的语义。
- 详情的顶部返回和左边缘右滑恢复原本、查询及滚动位置。未增加左右换篇、上一天或下一天按钮。系统原生 iOS 手势仍需真机核验。
- 只能在相同语言本之间移动；编号冲突拒绝保存，并建议下一个可用编号。移动保留内部 UID、日期及正文，标题文字不自动改写。

## 英文笔记与导入兼容

`src/data.ts` 及原有英文校验保持不变。`schemaVersion: 1` 的单篇、数组和 `{ "notes": [...] }` 容器仍可导入，目标为当前英文笔记本。

```json
{
  "schemaVersion": 1,
  "id": "day-01",
  "day": 1,
  "date": "2026-01-01",
  "title": "Day 01｜日常问候",
  "topic": "日常问候",
  "sentences": [{ "id": "s01", "en": "Good morning.", "zh": "早上好。" }],
  "mistakes": [{ "id": "m01", "original": "I is ready.", "corrected": "I am ready." }]
}
```

保留旧字符串纠错、无法确定对应关系的 `legacyMistakes`、句子 `tip`、`summary` 和 `example` 等兼容数据；英文编辑与阅读区块不改成中文正文格式。

## 中文自由笔记与 JSON

本内右上角 `+` → 手动新增：编号自动分配并可修改，选择日期、填写标题、粘贴 Markdown 正文；保存后进入详情。没有英文或纠错必填项，一个正文可以包含任意数量的问题与段落。

```json
{
  "schemaVersion": 2,
  "id": "zh-01",
  "day": 1,
  "date": "2026-11-13",
  "title": "调查研究答题思路",
  "content": "## 如何开展调查？\n\n**回答思路**\n1. 明确目标\n2. 收集资料\n\n- 注重实效\n- 及时反馈"
}
```

中文支持单篇对象和多篇数组；`content` 保存完整原文。编号为 1–10000 整数，日期必须真实有效，id、标题与正文非空，正文最多 500000 个 UTF-16 代码单元（中文常用字约 50 万字）。单次 JSON 导入最多 1000 篇，累计数据库与完整备份没有 1000 篇上限。

导入先整批验证再预览新增/更新；仅按当前本内编号或导入 id 识别更新候选。更新需明确确认。编号和身份指向不同笔记、同批重复编号或多次更新同一身份均拒绝整批。不同本的相同编号或导入 id 不互相覆盖。

## Markdown 安全与长文

阅读使用 `react-markdown` 10 + `remark-breaks`，允许一级至三级标题、加粗、列表、段落、换行及简单文本排版。禁用 HTML；没有 `rehype-raw`、HTML 注入、图片、iframe 或嵌入网页。标签采用明确白名单；链接仅保留文字，不生成可点击的 a 元素，也不会请求图片资源。实现遵循 [react-markdown 安全说明](https://github.com/remarkjs/react-markdown#security)。

编辑时只有普通 textarea，不实时解析或渲染 Markdown；大段粘贴一次替换选区，超限保留原文并提示。阅读组件 memo 化；搜索解析采用有大小上限的缓存和延迟查询。已用 90053 字符模拟正文检查窄屏粘贴、显示及长文滚动，iPhone 输入法和真实剪贴板行为仍需实机确认。

## 版本与迁移

| 范围 | V3 取值 |
| --- | --- |
| IndexedDB 数据库 | `speaklog`，版本 **1**，对象仓库 `app` |
| 应用数据 | `dataVersion: 3`，保存键 `state-v3` |
| 英文内容 | `schemaVersion: 1` |
| 中文内容 | `schemaVersion: 2` |
| 全量备份 | `backupVersion: 3` |
| 人工恢复安全副本 | `recoveryVersion: 1` |

V3 笔记本为 `{ id, name, language: 'en' | 'zh' }`，笔记为英文或中文内容与 `{ uid, notebookId }` 的组合。schemaVersion 是内容类型判别字段，英文不要求中文专有字段。

首次加载在单一 readwrite 事务中读取并验证 V2，保留 `v2-before-v3`、`v1-before-v3`，记录两个旧状态指纹，最后写入 `state-v3`。原 `state-v2`、V1 `state` 和全部既有快照不改写。保留笔记本 ID、笔记 UID、编号、日期及每一项英文内容；中文不建空本。无 V2 的设备兼容从 V1 直接迁移。

任意校验、存储或配额错误都会中止整个事务；不删除数据库、不清空仓库。已有 V3 时只加载验证，损坏时不会回退初始化覆盖。后续写入校验 revision，拒绝过期页面；若 V1/V2 旧页面修改了原数据，停止 V3 加载与保存，保留双方供人工核对。每次保存保留 `v3-before-last-save`，恢复前额外保留 `v3-before-last-restore`。

## 备份与恢复

设置 → 导出全部笔记本：生成 V3 全量备份，包含所有分类、本、笔记、内部身份、归属及排序。分类选择是当前设备偏好，不纳入内容备份。恢复合并保留当前设备排序。

- 支持 V1/V2/V3。旧备份归英文；V1 进入英文“采购职场英语”，不匹配中文同名本。
- V2/V3 按笔记本 ID 优先、同语言同名其次匹配；保留已有名称。同一本内按 UID 或编号匹配。
- 先预览新增/更新；确认后匹配项整篇更新，其余保留。空备份不删除内容。
- 笔记身份跨本、UID 与编号指向不同笔记、多本映射到一本、笔记本同 ID 不同语言等冲突均停止恢复。
- 异常时“导出安全副本”读取 app 中所有现存键，包含各版本状态、指纹与快照。此文件供人工核对，不能作为普通笔记直接导入。

私密文件校验脚本仅只读文件，所有数据库操作均为 Node fake-indexeddb 内存实例；不把私人内容打印、写入源码或上传。

```sh
node scripts/check-v2-source-backup.mjs "当前 V2 全量备份的本地路径"
node scripts/check-v3-backup.mjs "当前 V2 全量备份的本地路径"
```

旧 `check-v1-backup.mjs`、`check-v2-backup.mjs` 继续针对 V1 输入；后者通过 `baseline-v2.mjs` 从本地 Git 读取已验证 V2 提交的源码，避免 V3 开发改变历史校验结论。

## 发布、PWA 与回退

发布前必须获得真实备份确认、隔离校验通过，以及用户明确回复“本地验收通过，可以发布 V3”。现有 main → GitHub Actions 的测试、类型检查、构建和部署工作流保留；不 force push。代码推送不是发布成功，必须核对 build/deploy 作业及线上 HTML、JS、CSS、manifest 和 SW。

Service Worker 保持 prompt 等待策略，无强制 skipWaiting/clientsClaim。保存输入、关闭所有旧 SpeakLog 页面后重新打开，使新 Worker 激活；不卸载主屏幕应用，不清除 Safari 数据。更新仅替换静态资源，存储来源不变。

V2 回退标签：`speaklog-v2.0-before-v3-20261113`，对应 `06f48184deb741cff58cdb1ee38b4d800942bb06`。完整源码和 Git bundle 位于忽略目录 `backups/v2-before-v3-20261113/`。

**代码回退不等于数据库回退。** V2 不认识 V3 中文内容，也看不到 V3 新增或修改的英文内容。若异常，停止编辑、先导出 V3 全量备份及安全副本，不清库；优先修复 V3。必须回退时，在保留全部历史的前提下创建恢复 V2 代码的新提交，经批准后正常发布；不能把 V3 备份改版本号后交给 V2。避免两代应用交替编辑，后续人工合并须在隔离环境执行。

## 文件与验收

- `src/model.ts`、`src/storage.ts`：双语模型、事务迁移及合并恢复。
- `src/chinese.ts`、`src/markdown.ts`、`src/components/Markdown.tsx`：中文校验、安全显示与文本搜索。
- `src/App.tsx`、`src/components/Editor.tsx`、`src/style.css`、`src/preferences.ts`：分类界面、编辑与偏好。
- `src/navigation.ts`：新增中文保存后替换当前历史条目，原返回与手势逻辑保留。
- `src/*.test.*`、`tests/e2e/v3.pw.ts`：回归、迁移、安全、组件及窄屏流程。
- `docs/v3-local-acceptance.md`：本地验收报告、清单和待批准状态。

私人 JSON、备份及密钥不得复制进项目或提交公开仓库。现有 `.gitignore` 继续排除私人数据和本地工具状态；public 中仅包含既有图标，禁止放私人文件。发布前逐项审核文件，禁止用 `git add -f` 绕过排除规则。
