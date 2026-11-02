import { ref, watch } from 'vue';
import { translate, type Language, type MessageKey } from '../i18n';

// Korean is the default; only an explicit choice is stored, so older automatic 'language' values are ignored.
const stored = localStorage.getItem('languageChoice');
const language = ref<Language>(
  stored === 'en' || stored === 'ja' ? stored : 'ko',
);
watch(language, (value) => localStorage.setItem('languageChoice', value));
// The app is 느좋 in Korean and NeuJoh elsewhere, including the browser tab.
watch(
  language,
  (value) => {
    document.documentElement.lang = value;
    document.title = translate(value, 'appTitle');
  },
  { immediate: true },
);

export function useLanguage() {
  return { language, t: (key: MessageKey) => translate(language.value, key) };
}
