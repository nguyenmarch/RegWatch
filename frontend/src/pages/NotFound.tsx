import { Link, useLocation } from 'react-router-dom'
import { HomeIcon, ActivityIcon, ArrowRightIcon } from '../components/Icons'

export default function NotFound() {
  const { pathname } = useLocation()

  return (
    <div className="nf-page">
      <div className="nf-inner">

        <div className="nf-glitch-wrap">
          <div className="nf-code">404</div>
        </div>

        <h1 className="nf-title">Page not found</h1>
        <p className="nf-desc">
          No route matches <code>{pathname}</code>.<br />
          The page may have been moved or never existed.
        </p>

        <div className="nf-actions">
          <Link to="/" className="btn btn-primary">
            <HomeIcon size={15} />
            Go home
            <ArrowRightIcon size={14} />
          </Link>
          <Link to="/test" className="btn btn-outline">
            <ActivityIcon size={15} />
            Health test
          </Link>
        </div>

      </div>
    </div>
  )
}
