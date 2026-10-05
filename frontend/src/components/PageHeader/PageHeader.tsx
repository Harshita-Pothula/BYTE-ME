import styles from './PageHeader.module.css'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  actions?: React.ReactNode
}

export default function PageHeader({
  eyebrow,
  title,
  actions,
}: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
