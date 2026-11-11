import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ur from './locales/ur.json';
import { safeGet, safeSet } from '../lib/storage';

const KEY = 'speaksafe.lang';
const saved = safeGet(KEY);

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ur: { translation: ur } },
  lng: saved === 'ur' ? 'ur' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes output
});

// Keep <html lang> and dir in sync so screen readers and right-to-left layout work (FR-42).
function applyLang(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === 'ur' ? 'rtl' : 'ltr';
}
applyLang(i18n.language);
i18n.on('languageChanged', (lng) => {
  applyLang(lng);
  safeSet(KEY, lng);
});

export default i18n;
