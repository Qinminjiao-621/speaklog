import { useState } from 'react';
import { Plus } from 'lucide-react';
import { validateNotes } from '../data';
import type { Note } from '../data';
import type { ContentNote } from '../model';
import { MAX_CONTENT_LENGTH, validateChineseNotes } from '../chinese';
import type { ChineseNote } from '../chinese';
const uniqueId = () => crypto.randomUUID();
const dayLabel = (day: number) => `Day ${String(day).padStart(2, '0')}`;
function EnglishEditor({ initial, busy, onSave, onCancel }: { initial: Note; busy: boolean; onSave: (n: Note) => Promise<void>; onCancel: () => void }) {
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

function ChineseEditor({ initial, busy, onSave, onCancel }: { initial: ChineseNote; busy: boolean; onSave: (n: ChineseNote) => Promise<void>; onCancel: () => void }) {
  const [note, setNote] = useState(initial);
  const [error, setError] = useState('');
  const patch = (change: Partial<ChineseNote>) => setNote(n => ({ ...n, ...change }));
  return <form onSubmit={e => { e.preventDefault(); try { const checked = validateChineseNotes(note)[0]; setError(''); void onSave(checked); } catch (err) { setError((err as Error).message); } }}>
    <h1>{initial.title ? '编辑中文笔记' : '新增中文笔记'}</h1>
    {error && <p role="alert" className="notice">{error}</p>}
    <fieldset disabled={busy}>
      <div className="columns"><label>编号<input required type="number" min="1" max="10000" value={note.day || ''} onChange={e => patch({ day: Number(e.target.value) })}/></label><label>日期<input required type="date" value={note.date} onChange={e => patch({ date: e.target.value })}/></label></div>
      <label>标题<input required value={note.title} onChange={e => patch({ title: e.target.value })}/></label>
      <label>Markdown 正文<textarea className="chinese-input" required maxLength={MAX_CONTENT_LENGTH} value={note.content} placeholder="直接粘贴中文回答或材料，支持标题、加粗和列表。" onChange={e => patch({ content: e.target.value })}
        onPaste={e => {
          const text = e.clipboardData.getData('text/plain');
          if (text.length < 4096) return;
          // Native character insertion is very slow for large mobile textareas.
          // Replace the selected range once; never parse Markdown during input.
          e.preventDefault();
          const field = e.currentTarget;
          if (field.value.length - (field.selectionEnd - field.selectionStart) + text.length > MAX_CONTENT_LENGTH) {
            setError(`正文最多 ${MAX_CONTENT_LENGTH} 字，本次未粘贴，原文保留。`); return;
          }
          field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end');
          patch({ content: field.value }); setError('');
        }}/></label>
      <div className="actions"><button className="primary" type="submit">{busy ? '保存中…' : '保存笔记'}</button><button type="button" onClick={onCancel}>取消</button></div>
    </fieldset>
  </form>;
}
export default function Editor(props: { initial: ContentNote; busy: boolean; onSave: (n: ContentNote) => Promise<void>; onCancel: () => void }) {
  return props.initial.schemaVersion === 1 ? <EnglishEditor {...props} initial={props.initial}/> : <ChineseEditor {...props} initial={props.initial}/>;
}
