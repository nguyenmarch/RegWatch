import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import vi from './locales/vi'

const savedLang = localStorage.getItem('lang') ?? 'vi'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      vi: { translation: vi },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
