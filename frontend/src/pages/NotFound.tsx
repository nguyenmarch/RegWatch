import { Link, useLocation } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { HomeIcon, ActivityIcon, ArrowRightIcon } from '../components/Icons'

export default function NotFound() {
  const { pathname } = useLocation()
  const { t } = useTranslation()

  return (
    <div className="nf-page">
      <div className="nf-inner">

        <div className="nf-glitch-wrap">
          <div className="nf-code">404</div>
        </div>

        <h1 className="nf-title">{t('notFound.title')}</h1>
        <p className="nf-desc">
          <Trans
            i18nKey="notFound.desc"
            values={{ path: pathname }}
            components={{ code: <code /> }}
          />
        </p>

        <div className="nf-actions">
          <Link to="/" className="btn btn-primary">
            <HomeIcon size={15} />
            {t('notFound.goHome')}
            <ArrowRightIcon size={14} />
          </Link>
          <Link to="/test" className="btn btn-outline">
            <ActivityIcon size={15} />
            {t('notFound.healthTest')}
          </Link>
        </div>

      </div>
    </div>
  )
}
