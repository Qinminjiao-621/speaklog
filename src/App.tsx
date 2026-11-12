import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Download, FileUp, Plus, Search, X } from 'lucide-react';
import { createBackup, loadState, mergeNotes, parseNotes, saveState, searchNotes, validateBackup, validateNotes } from './data';
import type { Note, State } from './data';

const uniqueId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const dayLabel = (day: number) => `Day ${String(day).padStart(2, '0')}`;
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const template = JSON.stringify({ schemaVersion: 1, id: 'day-04', day: 4, date: '2026-11-10', title: 'Day 04｜采购报价谈判', topic: '采购报价谈判', sentences: [{ id: 'day-04-s01', en: 'I would ask the supplier to break down the price into materials, labor, and overhead.', zh: '我会要求供应商将报价拆分为材料、人工和间接费用。' }], mistakes: [{ id: 'day-04-m01', original: 'Your price is too high than the market price.', corrected: 'Your price is higher than the market price.' }] }, null, 2);

function Editor({ initial, busy, onSave, onCancel }: { initial: Note; busy: boolean; onSave: (n: Note) => Promise<void>; onCancel: () => void }) {
  const [note, setNote] = useState(initial);
  const [error, setError] = useState('');
  const patch = (v: Partial<Note>) => setNote(n => ({ ...n, ...v }));
  return <form onSubmit={e => { e.preventDefault(); try { const n = validateNotes(note)[0]; setError(''); void onSave(n); } catch (err) { setError((err as Error).message); } }}>
    <h1>{initial.title ? '编辑笔记' : '新增笔记'}</h1>
    {error && <p role="alert" className="notice">{error}</p>}
    <fieldset disabled={busy}>
      <div className="card fields"><div className="columns"><label>Day 编号<input required type="number" min="1" max="10000" value={note.day || ''} onChange={e => patch({ day: Number(e.target.value) })}/></label><label>日期<input required type="date" value={note.date} onChange={e => patch({ date: e.target.value })}/></label></div>
        <label>标题<input required value={note.title} placeholder={`${dayLabel(note.day)}｜练习主题`} onChange={e => patch({ title: e.target.value })}/></label>
        <label>练习主题<input required value={note.topic} onChange={e => patch({ topic: e.target.value })}/></label></div>
      <h2>今日句子</h2>
      {note.sentences.map((s, i) => <div className="card fields" key={s.id}><div className="row"><strong>句子 {i + 1}</strong><button type="button" className="danger" disabled={note.sentences.length === 1} onClick={() => patch({ sentences: note.sentences.filter((_, j) => i !== j) })}>删除句子</button></div>
        <label>英文<textarea required value={s.en} onChange={e => patch({ sentences: note.sentences.map((v, j) => j === i ? { ...v, en: e.target.value } : v) })}/></label>
        <label>中文翻译<textarea required value={s.zh} onChange={e => patch({ sentences: note.sentences.map((v, j) => j === i ? { ...v, zh: e.target.value } : v) })}/></label></div>)}
      <button type="button" onClick={() => patch({ sentences: [...note.sentences, { id: `${note.id}-s-${uniqueId()}`, en: '', zh: '' }] })}><Plus size={18}/>添加句子</button>
      <h2>今日纠错</h2>
      {note.mistakes.map((m, i) => <div className="card fields" key={m.id}><div className="row"><strong>纠错 {i + 1}</strong><button type="button" className="danger" onClick={() => patch({ mistakes: note.mistakes.filter((_, j) => i !== j) })}>删除纠错</button></div>
        <label>原始错误表达<textarea required value={m.original} onChange={e => patch({ mistakes: note.mistakes.map((v, j) => j === i ? { ...v, original: e.target.value } : v) })}/></label>
        <label>正确表达<textarea required value={m.corrected} onChange={e => patch({ mistakes: note.mistakes.map((v, j) => j === i ? { ...v, corrected: e.target.value } : v) })}/></label></div>)}
      <button type="button" onClick={() => patch({ mistakes: [...note.mistakes, { id: `${note.id}-m-${uniqueId()}`, original: '', corrected: '' }] })}><Plus size={18}/>添加纠错</button>
      {!!note.legacyMistakes?.length && <><h2>旧版纠错原文</h2><p className="muted">原文没有明确的前后对应关系，保留原文供核对。</p>{note.legacyMistakes.map((m, i) => <label key={i}>记录 {i + 1}<textarea value={m} onChange={e => patch({ legacyMistakes: note.legacyMistakes!.map((v, j) => j === i ? e.target.value : v) })}/></label>)}</>}
      <div className="actions"><button className="primary" type="submit">{busy ? '保存中…' : '保存笔记'}</button><button type="button" onClick={onCancel}>取消</button></div>
    </fieldset>
  </form>;
}

export default function App() {
  const [data, setData] = useState<State>(); const current = useRef<State | undefined>(undefined);
  const [fatal, setFatal] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState<string>();
  const [importing, setImporting] = useState(false); const [input, setInput] = useState(''); const [editing, setEditing] = useState<Note>();
  useEffect(() => { loadState().then(s => { current.current = s; setData(s); }).catch(e => setFatal(`无法读取本地笔记：${(e as Error).message}。原始数据未更改，请勿清除网站数据。`)); }, []);
  async function commit(fn: (s: State) => State) {
    if (lock.current || !current.current) return false;
    lock.current = true; setBusy(true);
    try { const next = fn(current.current); await saveState(next); current.current = next; setData(next); return true; }
    catch { setMessage('保存失败，数据未更改。请检查存储权限或空间后重试。'); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  function home() { setSelected(undefined); setEditing(undefined); setImporting(false); window.scrollTo(0, 0); }
  async function importNotes() {
    try { const notes = parseNotes(input); let result = { added: 0, updated: 0 };
      if (await commit(s => { const r = mergeNotes(s, notes); result = r; return r.state; })) { setMessage(`导入成功：新增 ${result.added} 篇，更新 ${result.updated} 篇。`); setInput(''); home(); }
    } catch (e) { setMessage((e as Error).message); }
  }
  async function readFile(file: File | undefined, restore = false) {
    if (!file) return;
    try { const text = await file.text(); if (!restore) { setInput(text); setMessage('文件已读取，请点击“验证并导入”。'); return; }
      const restored = validateBackup(JSON.parse(text));
      if (window.confirm(`将合并恢复 ${restored.notes.length} 篇笔记，相同 ID 的笔记会被备份内容更新，其余笔记保留。是否继续？`)) {
        if (await commit(s => mergeNotes(s, restored.notes).state)) { setMessage('备份恢复成功。'); home(); }
      }
    } catch (e) { setMessage(e instanceof SyntaxError ? 'JSON 格式错误，未修改笔记。' : (e as Error).message); }
  }
  function exportBackup() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(createBackup(data), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `speaklog-backup-${localDate()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage('已请求导出全部笔记，请确认备份已保存到“文件”App。');
  }
  function addNote() {
    const day = Math.max(0, ...data!.notes.map(n => n.day)) + 1;
    let id = `day-${String(day).padStart(2, '0')}`;
    if (data!.notes.some(n => n.id === id)) id += `-${uniqueId()}`;
    setEditing({ schemaVersion: 1, id, day, date: localDate(), title: '', topic: '', sentences: [{ id: `${id}-s01`, en: '', zh: '' }], mistakes: [] });
  }
  if (!data) return <main><h1>SpeakLog</h1><p role={fatal ? 'alert' : 'status'}>{fatal || '正在打开笔记…'}</p>{fatal && <button onClick={() => location.reload()}>重新加载</button>}</main>;
  const note = data.notes.find(n => n.id === selected);
  const notes = searchNotes(data.notes, query);
  return <main>
    <header><span className="brand">SpeakLog</span><span className="muted">英语口语笔记本</span></header>
    {message && <div className="notice" role="status"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage('')}><X size={18}/></button></div>}
    {(note || importing) && !editing && <button className="back" onClick={home}><ArrowLeft size={18}/>全部笔记</button>}
    {editing ? <Editor initial={editing} busy={busy} onCancel={() => setEditing(undefined)} onSave={async n => { if (await commit(s => mergeNotes(s, [n]).state)) { setEditing(undefined); setSelected(n.id); setMessage('笔记已保存。'); window.scrollTo(0, 0); } }}/>
      : note ? <>
        <div className="row"><p className="muted">{dayLabel(note.day)} · {note.date}{note.example ? ' · 示例' : ''}</p><button disabled={busy} onClick={() => setEditing(note)}>编辑</button></div>
        <h1>{note.title}</h1><p className="topic">{note.topic}</p>
        <h2>今日句子</h2>{note.sentences.map((s, i) => <article className="card" key={s.id}><span className="muted">{String(i + 1).padStart(2, '0')}</span><p lang="en" className="english">{s.en}</p><p className="translation">{s.zh}</p></article>)}
        <h2>今日纠错</h2>{note.mistakes.length || note.legacyMistakes?.length ? <>{note.mistakes.map(m => <article className="card" key={m.id}><span className="muted">原始表达</span><p lang="en" className="original">{m.original}</p><p className="arrow">↓</p><span className="muted">正确表达</span><p lang="en" className="english">{m.corrected}</p></article>)}
          {!!note.legacyMistakes?.length && <article className="card"><h3>旧版纠错原文</h3><p className="muted">无法确认原始表达与正确表达的对应关系，保留原文。</p>{note.legacyMistakes.map((m, i) => <p className="preserve" key={i}>{m || '（空记录）'}</p>)}</article>}</> : <p className="muted">当天没有纠错记录。</p>}
        <button disabled={busy} className="danger delete" onClick={async () => { if (window.confirm(`确定删除「${note.title}」？删除后可通过已有备份恢复。`) && await commit(s => ({ notes: s.notes.filter(n => n.id !== note.id) }))) { home(); setMessage('笔记已删除。'); } }}>删除笔记</button>
      </> : importing ? <>
        <h1>导入笔记</h1><p className="muted">粘贴 ChatGPT 生成的 JSON，或选择 JSON 文件。相同 ID 更新内容。</p>
        <label className="file-button"><FileUp size={18}/>选择 JSON 文件<input disabled={busy} type="file" accept=".json,application/json" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }}/></label>
        <label>笔记 JSON<textarea className="json" spellCheck={false} value={input} placeholder="在此粘贴 JSON…" onChange={e => setInput(e.target.value)}/></label>
        <button className="primary wide" disabled={busy || !input.trim()} onClick={() => void importNotes()}>验证并导入</button>
        <details className="card"><summary>查看 JSON 格式示例</summary><pre>{template}</pre></details>
      </> : <>
        <label className="search"><Search size={20}/><input type="search" aria-label="搜索全部笔记" placeholder="搜索中文或英文关键词" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="actions"><button className="primary" onClick={() => setImporting(true)}><FileUp size={18}/>导入笔记</button><button onClick={addNote}><Plus size={18}/>手动新增</button></div>
        <h1 className="list-title">{query.trim() ? '搜索结果' : '每日笔记'}</h1>
        <div className="note-list">{notes.map(n => <button className="note-row card" key={n.id} onClick={() => { setSelected(n.id); window.scrollTo(0, 0); }}><div className="day"><small>DAY</small><strong>{String(n.day).padStart(2, '0')}</strong></div><div className="note-copy"><h2>{n.title}</h2><p>{n.date}{n.example ? ' · 示例' : ''}</p><p>{n.topic}</p></div><ChevronRight size={18}/></button>)}</div>
        {!notes.length && <div className="empty"><h2>{query.trim() ? '没有匹配的笔记' : '收录你的第一篇口语笔记'}</h2><p>{query.trim() ? '试试其他中文或英文关键词。' : '导入 ChatGPT 整理的每日笔记，也可以手动新增。'}</p></div>}
        <footer><h2>数据备份</h2><button disabled={busy} onClick={exportBackup}><Download size={18}/>导出全部笔记</button><label className="file-button"><FileUp size={18}/>从 JSON 备份恢复<input disabled={busy} type="file" accept=".json,application/json" onChange={e => { void readFile(e.target.files?.[0], true); e.target.value = ''; }}/></label><p className="muted">笔记仅保存在当前设备，请定期导出备份。恢复时合并笔记，相同 ID 更新。</p></footer>
      </>}
  </main>;
}
