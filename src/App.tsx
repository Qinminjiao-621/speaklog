import { useDeferredValue, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Download, FileUp, MoreHorizontal, Plus, Search, Settings, X } from 'lucide-react';
import { parseNotes } from './data';
import { parseChineseNotes } from './chinese';
import Markdown from './components/Markdown';
import { readLanguage, rememberLanguage } from './preferences';
import { addBook, applyPlan, deleteBook, deletionPrompts, exportLibrary, getBook, moveNote, newId, nextDay, planImport, planRestore, renameBook, saveNote, searchLibrary, sortedNotes, noteLabel, noteLanguage } from './model';
import type { ContentNote, Language, Library, Plan, StoredNote } from './model';
import { repository } from './storage';
import { useNavigation } from './useNavigation';
import Editor from './components/Editor';

const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function Modal({ title, children, onClose, busy }: { title: string; children: ReactNode; onClose: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="row"><h2 id="dialog-title">{title}</h2><button disabled={busy} aria-label="关闭对话框" onClick={onClose}><X size={20}/></button></div>{children}
  </dialog>;
}
function SearchBox({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return <label className="search"><Search size={19}/><input type="search" aria-label="搜索当前笔记本" placeholder="搜索编号或正文关键词" value={value} onChange={e => onChange(e.target.value)}/></label>;
}
function MoveDialog({ state, note, busy, error, onClose, onMove }: { state: Library; note: StoredNote; busy: boolean; error: string; onClose: () => void; onMove: (book: string, day: number) => Promise<void> }) {
  const books = state.notebooks.filter(b => b.id !== note.notebookId && b.language === noteLanguage(note));
  const [target, setTarget] = useState(books[0]?.id ?? ''); const [day, setDay] = useState(note.day);
  const conflict = state.notes.some(n => n.notebookId === target && n.day === day);
  let suggestion: number | undefined;
  try { suggestion = target ? nextDay(state, target) : undefined; } catch { /* Full notebook: keep conflict visible; never crash the reader. */ }
  return <Modal title="移动笔记" busy={busy} onClose={onClose}>
    {error && <p role="alert" className="notice">{error}</p>}
    {!books.length ? <p>请先在首页新建另一个相同语言类型的笔记本。</p> : <form onSubmit={e => { e.preventDefault(); void onMove(target, day); }}><fieldset disabled={busy}>
      <label>目标笔记本<select value={target} onChange={e => { setTarget(e.target.value); setDay(note.day); }}>{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>目标编号<input required type="number" min="1" max="10000" value={day || ''} onChange={e => setDay(Number(e.target.value))}/></label>
      {conflict && <div role="alert" className="notice">目标笔记本已有 {noteLabel({ ...note, day })}，不会覆盖。{suggestion !== undefined ? <button type="button" onClick={() => setDay(suggestion!)}>改用 {noteLabel({ ...note, day: suggestion })}</button> : <p>目标笔记本编号已满，请选择其他笔记本。</p>}</div>}
      <p className="muted">移动保留内容和日期，源笔记本不再保留副本。标题保持不变，可在编辑中调整。</p>
      <button className="primary wide" disabled={conflict || !day} type="submit">确认移动</button>
    </fieldset></form>}
  </Modal>;
}
const example = JSON.stringify({ schemaVersion: 1, id: 'day-01', day: 1, date: '2026-01-01', title: 'Day 01｜日常问候', topic: '日常问候', sentences: [{ id: 's01', en: 'Good morning.', zh: '早上好。' }], mistakes: [] }, null, 2);

const chineseExample = JSON.stringify({ schemaVersion: 2, id: 'zh-01', day: 1, date: '2026-01-01', title: '面试回答', content: '## 问题\n如何开展调查？\n\n**回答思路**\n1. 明确目标\n2. 收集资料\n\n- 注重实效' }, null, 2);

export default function App() {
  const [language, setLanguage] = useState<Language>(readLanguage);
  const selectLanguage = (value: Language) => { setLanguage(value); rememberLanguage(value); };
  const [data, setData] = useState<Library>(); const current = useRef<Library | undefined>(undefined);
  const [fatal, setFatal] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [input, setInput] = useState('');
  const [review, setReview] = useState<{ plan: Plan; restore: boolean }>(); const [moving, setMoving] = useState(false);
  const { entry, nav } = useNavigation(!!data, !review && !moving && !busy);
  const view = entry.view;
  const query = useDeferredValue(view.query);
  useEffect(() => {
    let active = true;
    repository.load().then(s => { if (active) { current.current = s; setData(s); } }).catch(e => { if (active) setFatal(e.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => { setInput(''); setMoving(false); setReview(undefined); }, [entry.index, view.page]);
  useEffect(() => {
    if (view.page !== 'edit' && !(view.page === 'add' && input)) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [view.page, input]);
  async function commit(fn: (s: Library) => Library, reason = 'edit') {
    if (lock.current || !current.current) return false;
    lock.current = true; setBusy(true);
    try {
      const next = await repository.save(fn(current.current), reason); current.current = next; setData(next); return true;
    } catch (e) { setMessage((e as Error).message || '保存失败，原数据未更改，请检查存储空间。'); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  const attempt = (fn: () => void) => { try { fn(); } catch (e) { setMessage((e as Error).message); } };
  const back = () => { if (busy) return; if ((view.page === 'edit' || (view.page === 'add' && input)) && !window.confirm('离开将放弃尚未保存的输入，确定返回？')) return; nav.current?.back(); };
  async function recovery() {
    try { download(await repository.recoveryCopy(), `speaklog-recovery-${localDate()}.json`); setMessage('已请求导出安全副本，请确认文件已保存。此文件用于人工恢复，不要直接作为普通笔记导入。'); }
    catch { setMessage('安全副本导出失败，请保持当前页面并寻求协助，不要清除数据。'); }
  }
  async function readFile(file?: File, restore = false) {
    if (!file || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      if (restore) { setReview({ plan: planRestore(current.current!, JSON.parse(text)), restore: true }); setMessage(''); }
      else { setInput(text); setMessage('文件已读取，请点击“预览导入”。'); }
    } catch (e) { setMessage(e instanceof SyntaxError ? 'JSON 格式不正确，原数据未更改。' : (e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!data) return <main><h1>SpeakLog <small>V3.0</small></h1><p role={fatal ? 'alert' : 'status'}>{fatal || '正在安全加载笔记…'}</p>{fatal && <><p>原始数据未删除。请勿卸载 APP 或清除网站数据。</p><button onClick={() => void recovery()}>导出安全副本</button><button onClick={() => location.reload()}>重新加载</button></>}{message && <p role="status">{message}</p>}</main>;
  const book = data.notebooks.find(b => b.id === view.bookId);
  const note = data.notes.find(n => n.uid === view.uid);
  const noteBook = note && data.notebooks.find(b => b.id === note.notebookId);
  const openNote = (n: StoredNote) => nav.current?.go({ page: 'detail', uid: n.uid, bookId: n.notebookId, query: '' });
  const results = () => {
    const hits = book ? searchLibrary(data, query, book.id) : [];
    return <><p className="muted" role="status">{hits.length} 篇结果</p><div className="results">{hits.map(({ note: n, snippet }) => <button className="result" key={n.uid} onClick={() => openNote(n)}>
      <div className="row"><strong>{noteLabel(n)} · {n.schemaVersion === 1 ? n.topic : n.title}</strong><ChevronRight size={18}/></div>
      <p>{snippet}</p>
    </button>)}</div>{!hits.length && <p className="empty">没有匹配的笔记，试试其他关键词。</p>}</>;
  };
  function createNotebook() { const name = window.prompt('新建笔记本名称'); if (name !== null) void commit(s => addBook(s, name, newId(), language)); }
  function renameNotebook(id: string) { const name = window.prompt('笔记本新名称', getBook(data!, id).name); if (name !== null) void commit(s => renameBook(s, id, name)); }
  async function removeNotebook(id: string) {
    const prompts = deletionPrompts(current.current!, id);
    for (const prompt of prompts) if (!window.confirm(prompt)) return;
    if (await commit(s => deleteBook(s, id, prompts.length))) setMessage('笔记本已删除。');
  }
  function blankNote(id: string): ContentNote {
    let day = 1;
    try { day = nextDay(data!, id); } catch { /* Existing values remain protected by saveNote uniqueness checks. */ }
    if (getBook(data!, id).language === 'zh') return { schemaVersion: 2, id: newId(), day, date: localDate(), title: '', content: '' };
    return { schemaVersion: 1, id: newId(), day, date: localDate(), title: '', topic: '', sentences: [{ id: newId(), en: '', zh: '' }], mistakes: [] };
  }
  const visibleBooks = data.notebooks.filter(b => b.language === language);
  return <main>
    <header className="topbar">{view.page === 'home' ? <h1 className="brand">SpeakLog <small>V3.0</small></h1> : <button disabled={busy} className="back" aria-label="返回上一页" onClick={back}><ArrowLeft size={20}/><span>返回</span></button>}
      {view.page === 'home' ? <button aria-label="设置与备份" onClick={() => nav.current?.go({ page: 'backup', query: '' })}><Settings size={21}/></button> : <span className="top-title">{view.page === 'detail' ? noteBook?.name : book?.name ?? 'SpeakLog'}</span>}
      {view.page === 'book' && book && <button aria-label="新增或导入笔记" onClick={() => nav.current?.go({ page: 'add', bookId: book.id, query: '' })}><Plus size={24}/></button>}
      {view.page === 'detail' && note && <details className="menu"><summary aria-label="笔记管理"><MoreHorizontal/></summary><div className="menu-items">
        <button disabled={busy} onClick={() => nav.current?.go({ page: 'edit', bookId: note.notebookId, uid: note.uid, query: '' })}>编辑笔记</button>
        <button disabled={busy} onClick={() => { setMessage(''); setMoving(true); }}>移动到其他笔记本</button>
        <button className="danger" disabled={busy} onClick={async () => { if (window.confirm(`删除 ${noteLabel(note)}「${note.title}」？请确保已有备份。`) && await commit(s => ({ ...s, notes: s.notes.filter(n => n.uid !== note.uid) }))) { nav.current?.back(); setMessage('笔记已删除。'); } }}>删除笔记</button>
      </div></details>}
    </header>
    {message && <div className="notice" role="status"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage('')}><X size={18}/></button></div>}
    {view.page === 'home' && <>
      <div className="language-switch" role="group" aria-label="笔记语言分类">{(['en', 'zh'] as const).map(value => <button key={value} aria-pressed={language === value} onClick={() => selectLanguage(value)}>{value === 'en' ? '英文笔记' : '中文笔记'}</button>)}</div>
      <div className="section-label"><h2>我的笔记本</h2><span>{visibleBooks.length} 本</span></div>
        <div className="book-list">{visibleBooks.map(b => <div className="book-row" key={b.id}>
          <button className="book-open" onClick={() => nav.current?.go({ page: 'book', bookId: b.id, query: '' })}><span className="book-icon"><BookOpen size={21}/></span><span className="book-name">{b.name}<small>{data.notes.filter(n => n.notebookId === b.id).length} 篇笔记</small></span><ChevronRight size={18}/></button>
          <details className="menu"><summary aria-label={`管理笔记本 ${b.name}`}><MoreHorizontal size={21}/></summary><div className="menu-items"><button disabled={busy} onClick={() => renameNotebook(b.id)}>重命名</button><button disabled={busy} className="danger" onClick={() => void removeNotebook(b.id)}>删除笔记本</button></div></details>
        </div>)}</div><button disabled={busy} className="wide new-book" onClick={createNotebook}><Plus size={19}/>新建笔记本</button>
        {!visibleBooks.length && <p className="empty">这里还没有笔记本，点击“新建笔记本”开始记录。</p>}
        <p className="privacy-note">笔记保存在当前设备 · 请定期备份</p>
    </>}
    {view.page === 'book' && (book ? <><SearchBox value={view.query} onChange={q => nav.current?.query(q)}/><div className="section-label"><span>{data.notes.filter(n => n.notebookId === book.id).length} 篇笔记</span><button disabled={busy} onClick={() => void commit(s => ({ ...s, order: s.order === 'asc' ? 'desc' : 'asc' }))} aria-label="切换 Day 排序">{data.order === 'asc' ? '↑ 正序' : '↓ 倒序'}</button></div>
      {view.query.trim() ? results() : <><div className="day-grid">{sortedNotes(data.notes.filter(n => n.notebookId === book.id), data.order).map(n => <button key={n.uid} className="day-target" aria-label={`${noteLabel(n)}，${n.schemaVersion === 1 ? n.topic : n.title}`} onClick={() => openNote(n)}><span className={n.day > 999 ? 'day-circle digits' : 'day-circle'}>{String(n.day).padStart(2, '0')}</span></button>)}</div>{!data.notes.some(n => n.notebookId === book.id) && <p className="empty">还没有笔记。点击右上角 + 导入或新增。</p>}</>}
    </> : <p>笔记本已不存在，请返回首页。</p>)}
    {view.page === 'detail' && (note ? <article className="note-detail">
      <p className="eyebrow">{noteLabel(note)} <span>· {note.date}</span></p>{note.schemaVersion === 2 ? <><h1>{note.title}</h1><Markdown content={note.content}/></> : <><h1>{note.topic}</h1>{note.title !== note.topic && <p className="note-title">{note.title}</p>}
      <h2>重点表达</h2><div className="expressions">{note.sentences.map(s => <section className="expression" key={s.id}><p lang="en" className="english">{s.en}</p><p className="translation">{s.zh}</p></section>)}</div>
      <h2>今日纠错</h2>{!note.mistakes.length && !note.legacyMistakes?.length && <p className="muted">当天没有纠错记录。</p>}
      {note.mistakes.map(m => <p className="correction" key={m.id}><del lang="en">{m.original}</del><span aria-hidden="true"> → </span><span lang="en">{m.corrected}</span></p>)}
      {!!note.legacyMistakes?.length && <section><h3>旧版纠错原文</h3>{note.legacyMistakes.map((m, i) => <p className="preserve" key={i}>{m || '（空记录）'}</p>)}</section>}</>}
    </article> : <p>笔记已不存在，请返回列表。</p>)}
    {view.page === 'add' && book && <>
      <h1>新增笔记</h1><p className="muted">导入到「{book.name}」</p><button className="secondary wide" onClick={() => attempt(() => { nextDay(data, book.id); if (book.language === 'zh') nav.current?.replace({ page: 'edit', bookId: book.id, query: '' }); else nav.current?.go({ page: 'edit', bookId: book.id, query: '' }); })}><Plus size={18}/>手动新增</button>
      <h2>导入 JSON</h2><label className="file-button"><FileUp size={18}/>选择 JSON 文件<input disabled={busy} type="file" accept=".json,application/json" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }}/></label>
      <label>笔记 JSON<textarea className="json" disabled={busy} spellCheck={false} value={input} placeholder="粘贴 ChatGPT 整理的 JSON" onChange={e => setInput(e.target.value)}/></label>
      <button className="primary wide" disabled={busy || !input.trim()} onClick={() => attempt(() => { setReview({ plan: planImport(data, book.id, book.language === 'en' ? parseNotes(input) : parseChineseNotes(input)), restore: false }); setMessage(''); })}>预览导入</button>
      <details className="example"><summary>查看 JSON 格式示例</summary><pre>{book.language === 'en' ? example : chineseExample}</pre></details>
    </>}
    {view.page === 'edit' && book && (view.uid && !note ? <p>笔记已不存在，请返回。</p> : <Editor key={`${entry.index}:${view.uid ?? 'new'}`} initial={note ?? blankNote(book.id)} busy={busy} onCancel={back} onSave={async n => { if (await commit(s => saveNote(s, n, book.id, view.uid))) { setMessage('笔记已保存。'); if (n.schemaVersion === 2 && !view.uid) { const saved = current.current!.notes.find(v => v.notebookId === book.id && v.id === n.id && v.day === n.day)!; nav.current?.replace({ page: 'detail', bookId: book.id, uid: saved.uid, query: '' }); } else nav.current?.back(); } }}/>) }
    {view.page === 'backup' && <><h1>设置与备份</h1><p className="muted">SpeakLog V3.0 · {data.notebooks.length} 本笔记本 · {data.notes.length} 篇笔记</p>
      <section className="settings-section"><h2>完整备份</h2><p>包含全部笔记本、笔记及归属关系。请保存到 iCloud Drive，并确认文件可读取。</p>
        <button disabled={busy} className="primary wide" onClick={() => attempt(() => { download(exportLibrary(data), `speaklog-backup-v3-${localDate()}.json`); setMessage('已请求导出，请确认文件保存完成。'); })}><Download size={18}/>导出全部笔记本</button>
        <label className="file-button wide"><FileUp size={18}/>从备份合并恢复<input disabled={busy} type="file" accept=".json,application/json" onChange={e => { void readFile(e.target.files?.[0], true); e.target.value = ''; }}/></label>
        <p className="muted">兼容 V1 / V2 / V3 备份。恢复会先预览新增与更新，不会清空现有笔记。V1 备份归入“采购职场英语”。</p>
      </section><section className="settings-section"><h2>数据保护</h2><p className="muted">遇到异常时先导出安全副本。请勿卸载 APP 或清除 Safari 网站数据。</p><button onClick={() => void recovery()}>导出安全副本</button></section>
      <section className="settings-section"><h2>版本更新</h2><p className="muted">新版本下载完成后，保存输入并关闭所有 SpeakLog 页面，再打开。更新只替换应用文件，笔记数据库保留。</p><button onClick={async () => { try { const registration = await navigator.serviceWorker?.getRegistration(); await registration?.update(); setMessage(registration?.waiting ? '新版本已就绪。保存输入后关闭所有 SpeakLog 页面，再重新打开。' : '已检查更新。若有更新下载，请稍后关闭所有页面再打开。'); } catch { setMessage('更新检查失败，请联网后重试。'); } }}>检查更新</button></section>
    </>}
    {review && <Modal title={review.restore ? '确认合并恢复' : '确认导入'} busy={busy} onClose={() => setReview(undefined)}>
      <>{message && <p role="alert" className="notice">{message}</p>}</>
      <p>新增 {review.plan.added} 篇，更新 {review.plan.updated} 篇{review.plan.booksAdded ? `，新增 ${review.plan.booksAdded} 本笔记本` : ''}。</p>
      <p className="muted">{review.restore ? '按笔记本 ID 优先、同语言同名其次匹配笔记本，保留现有名称；同一本内按笔记身份或 Day 匹配。' : '仅影响当前笔记本。'}更新会替换下列已有笔记的完整内容，其余笔记保留。</p>
      {review.plan.updated > 0 && <ul className="update-list">{review.plan.updates.map((v, i) => <li key={i}>{v}</li>)}</ul>}
      <button className="primary wide" disabled={busy} onClick={async () => { const pending = review; if (await commit(() => applyPlan(pending.plan, true), pending.restore ? 'restore' : 'import')) { setReview(undefined); setInput(''); setMessage(`已${pending.restore ? '恢复' : '导入'}：新增 ${pending.plan.added} 篇，更新 ${pending.plan.updated} 篇。`); if (!pending.restore) nav.current?.back(); } }}>确认{review.restore ? '合并恢复' : '导入'}{review.plan.updated ? '并更新' : ''}</button>
      <button className="wide" disabled={busy} onClick={() => setReview(undefined)}>取消，保留原数据</button>
    </Modal>}
    {moving && note && <MoveDialog state={data} note={note} busy={busy} error={message} onClose={() => setMoving(false)} onMove={async (target, day) => { if (await commit(s => moveNote(s, note.uid, target, day))) { setMoving(false); setMessage('笔记已移动。'); } }}/> }
  </main>;
}
