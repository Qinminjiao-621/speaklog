import type { Language } from './model';
const KEY = 'speaklog-language';
export function readLanguage(): Language {
  try { return localStorage.getItem(KEY) === 'zh' ? 'zh' : 'en'; } catch { return 'en'; }
}
export function rememberLanguage(language: Language) {
  try { localStorage.setItem(KEY, language); } catch { /* Preference failure must not block note storage. */ }
}
