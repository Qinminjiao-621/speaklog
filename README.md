# SpeakLog

个人英语口语每日笔记本，适配 iPhone 的 PWA。每天在 ChatGPT 练习英语并整理 JSON，然后导入 SpeakLog。仅提供笔记收录、查看、全文搜索和数据备份，无账号、后端或自动上传。

保留 Vite、React、TypeScript、IndexedDB、PWA 和 GitHub Pages 部署配置。

## 本地查看

需要 Node.js 22.12 或更高版本。

```sh
cd ~/Projects/speaklog
npm ci
npm run dev
```

打开 http://localhost:5173/speaklog/（以终端实际端口为准）。同一 Wi-Fi 下，iPhone 可打开终端显示的 Network 地址加 `/speaklog/`。局域网 HTTP 可查看界面，安装和离线缓存应使用 HTTPS；localhost 仅指当前设备。

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

生产预览通常为 http://localhost:4173/speaklog/。Service Worker 只在生产构建启用。不同协议、域名或端口拥有不同的浏览器存储，切换地址不会自动迁移笔记，请使用备份恢复。

## 使用

- 首页直接搜索中文或英文关键词，英文不区分大小写。搜索覆盖标题、主题、英文句子、中文翻译、原始错误表达、正确表达及保留的旧纠错原文，也支持日期和 Day 编号。
- 每日笔记按日期倒序排列，同日按 Day 编号倒序。点击结果打开完整笔记。
- “手动新增”默认使用已有最大 Day 编号加一，可修改日期、编号、标题、自由主题，并增删句子和纠错。编辑保留笔记与已有条目的 ID。
- 详情支持编辑及确认后删除。没有纠错时使用空数组。
- “导入笔记”可粘贴 JSON，或选择 JSON 文件后点击“验证并导入”。提供中文成功或失败提示；同 ID 更新整篇笔记，其他笔记保留。
- 首页底部提供导出全部笔记、从 JSON 备份恢复。无需设置页或其他导航。

## ChatGPT JSON 格式

```json
{
  "schemaVersion": 1,
  "id": "day-04",
  "day": 4,
  "date": "2026-11-10",
  "title": "Day 04｜采购报价谈判",
  "topic": "采购报价谈判",
  "sentences": [
    {
      "id": "day-04-s01",
      "en": "I would ask the supplier to break down the price into materials, labor, and overhead.",
      "zh": "我会要求供应商将报价拆分为材料、人工和间接费用。"
    }
  ],
  "mistakes": [
    {
      "id": "day-04-m01",
      "original": "Your price is too high than the market price.",
      "corrected": "Your price is higher than the market price."
    }
  ]
}
```

支持单篇对象、对象数组或 `{ "notes": [...] }`。无需 `tip`、`summary`、`reason` 或 `explanation` 字段。主题不限预设选项。

`schemaVersion` 必须为数字 1；`day` 为 1–10000 的整数；`date` 是真实的 YYYY-MM-DD 日期；ID、标题、主题和中英文内容必须是非空字符串。每篇 1–500 个句子，每次普通导入最多 1000 篇，主要文本字段最多 20000 字；累计笔记数量和备份恢复不受单批数量限制。整批校验后再保存，重复笔记 ID、篇内重复句子或纠错 ID、缺字段或类型错误都会拒绝整批操作。内容按纯文本显示。

可对 ChatGPT 说：“只输出 SpeakLog schemaVersion=1 JSON。sentences 包含 id/en/zh；mistakes 包含 id/original/corrected，没有纠错时为 []。同一天和已有条目保持 ID 稳定，不要输出代码围栏或解释性字段。”

## 旧数据兼容与备份

- 继续使用 IndexedDB 数据库 `speaklog`、版本 1、对象仓库 `app`、键 `state`。不清空、不删除旧库，不自动移除旧示例笔记。全新安装为空，不注入示例。
- 加载时在内存转换旧 schemaVersion=1 笔记，不写回数据库。第一次保存前，事务内将已有完整状态保存到 `legacy-state-before-simplification`，该快照以后不覆盖。它是内部保底副本，不替代文件备份。
- 旧字符串纠错中仅含一个明确 `→` 或 `->`，且两侧非空时，按原文顺序转换并生成稳定 ID。没有明确对应关系或有多个箭头时，保留至兼容字段 `legacyMistakes`，详情显示“旧版纠错原文”，也可搜索、编辑和导出；不推断或补写信息。
- 旧句子的 `tip`、旧 `summary` 和示例标记作为兼容数据保留在笔记及备份中；提示和总结不再作为新笔记的编辑字段或常规展示内容。旧功能状态不参与应用逻辑，仅原始数据库快照仍可保留它们。
- 读取失败不会初始化覆盖旧数据；保存失败不会更新页面中的笔记。不要清除网站数据来解决读取错误。
- 导出文件为 `speaklog-backup-日期.json`，含 `backupVersion: 1`、导出时间与全部 `notes`。兼容旧版 v1 备份。
- 恢复先校验并请求确认，再合并笔记；同 ID 用备份内容更新，其他本地笔记保留，空备份不会清空现有数据。普通导入和恢复都会用输入内容替换同 ID 的整篇笔记，请确认内容完整。
- 文件恢复不是自动同步。清除浏览器网站数据或系统回收存储可能导致笔记丢失，请定期导出到“文件”/iCloud Drive，并确认下载完成。避免多个标签页同时编辑。

## iPhone 与 PWA

Safari 打开 HTTPS 地址，等待首次在线加载完成，通过分享菜单“添加到主屏幕”。生产版预缓存静态应用，笔记保存在本机 IndexedDB；首次完成缓存后可离线查看、搜索和编辑。

更新采用等待策略，关闭所有旧页面再打开以使用新版本。真机验收建议：导入一篇 → 搜索并打开 → 编辑 → 重开检查 → 导出 → 恢复 → 关闭网络后查看。系统安装、离线与文件保存行为仍需在真实 iPhone 上确认。

## GitHub Pages

`.github/workflows/deploy.yml` 执行依赖安装、自动化测试、独立 TypeScript 检查和生产构建，再部署 `dist`。

需要部署时，将源码提交到名为 `speaklog` 的仓库，在 Settings → Pages 选择 GitHub Actions，推送 main 或手动运行工作流。访问 `https://你的用户名.github.io/speaklog/`。

路径 `/speaklog/` 配置在 `vite.config.ts` 的 base、manifest start_url/scope 和 `index.html` 图标链接中；更换仓库名时同步修改。界面使用应用内状态导航，不依赖服务器路由回退。

不要提交个人笔记或备份。`.gitignore` 默认忽略所有 JSON、JSONL 和 NDJSON，仅放行根目录的 package.json、package-lock.json、tsconfig.json；同时排除 node_modules、dist、备份目录、环境文件、常见密钥、凭据目录和本地缓存。新增项目配置 JSON 需要逐一审查后加入例外。不要使用 `git add -f` 绕过规则。`public/` 内的文件会直接发布到网站，即使被 Git 忽略，也不要把私人数据放进 public 或源码。

## 后续更新与设备迁移

首次部署需先完成 GitHub CLI 登录、确认目标账号及同名仓库情况，再确认公开上传源码。仓库创建后，在 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。如果首次运行早于此设置而失败，设置完成后在 Actions 中重新运行工作流。只有 build 和 deploy 均成功、线上页面与静态资源可访问时，才算完成部署。

首次关联远程 main 分支后，后续更新流程：

```sh
npm test
npm run typecheck
npm run build
git status --short
git diff
# 只添加本次已核查的源文件，例如：
git add src/App.tsx src/style.css
git diff --cached --stat
git diff --cached
git commit -m "Describe this update"
git push origin main
```

推送 main 会自动触发同一部署工作流；也可以在 Actions 手动运行。不要强制推送覆盖历史。更新应保持网站域名、/speaklog/ 路径和 IndexedDB 数据库配置稳定；只更新代码不需要清除网站数据。

本地 localhost 笔记不会自动出现在公网域名或其他设备上。迁移前，在原设备页面点击“导出全部笔记”，确认备份内容完整，再通过 AirDrop 或 iCloud Drive 保存到目标设备。部署验证成功后，用 iPhone Safari 打开网站，分享 → 添加到主屏幕，再从主屏幕打开 SpeakLog，通过首页“从 JSON 备份恢复”选择备份文件。单篇每日 JSON 可使用“导入笔记 → 选择 JSON 文件 → 验证并导入”。检查笔记和搜索结果，关闭后重开确认保存。此过程不会删除原设备的笔记。

## 验证与代码

- `src/App.tsx`：首页搜索、列表、详情、手动编辑、导入及备份入口。
- `src/data.ts`：格式校验、旧数据兼容、全文搜索、按 ID 合并、备份与 IndexedDB。
- `src/data.test.ts`：22 项自动化测试，覆盖新旧格式、搜索范围、重复 ID、备份往返、原始数据保护和超过 1000 篇的累计存储。
- `src/style.css`：iPhone 安全区域、触控尺寸、移动布局与系统深浅色。

已通过 22 项自动化测试、TypeScript 检查和生产构建。本地预览首页、manifest 与 Service Worker 均返回 HTTP 200。浏览器自动化宿主不可用，未完成视觉与点击验收；真实 iPhone 的安装、离线及下载恢复仍需验证。未发布或上传个人笔记。
