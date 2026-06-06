import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HomeIcon, ArrowRightIcon } from '../components/Icons'

export default function Unauthorized() {
  const { t } = useTranslation()

  return (
    <div className="nf-page">
      <div className="nf-inner">
        <div className="nf-glitch-wrap">
          <div className="nf-code">403</div>
        </div>

        <h1 className="nf-title">{t('unauthorized.title')}</h1>
        <p className="nf-desc">{t('unauthorized.desc')}</p>

        <div className="nf-actions">
          <Link to="/" className="btn btn-primary">
            <HomeIcon size={15} />
            {t('unauthorized.goHome')}
            <ArrowRightIcon size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}
