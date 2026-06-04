import { useTranslation } from 'react-i18next'
import { TrashIcon, XIcon, LoaderIcon } from '../Icons'

interface Props {
  docTitle: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}

export default function DeleteDialog({ docTitle, onConfirm, onCancel, loading }: Props) {
  const { t } = useTranslation()
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-icon dialog-icon--danger">
          <TrashIcon size={22} />
        </div>
        <h3 className="dialog-title">{t('documents.deleteDialogTitle')}</h3>
        <p className="dialog-desc">
          {t('documents.deleteDialogDesc', { title: docTitle })}
        </p>
        <div className="dialog-actions">
          <button className="btn btn-outline" onClick={onCancel} disabled={loading}>
            {t('documents.deleteCancel')}
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading
              ? <><LoaderIcon size={14} className="icon-spin" />{t('documents.deleting')}</>
              : <><TrashIcon size={14} />{t('documents.deleteYes')}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
