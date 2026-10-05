import styles from './Field.module.css'

interface FieldProps {
  id: string
  label: string
  children: React.ReactNode
  helper?: string
}

export default function Field({ id, label, children, helper }: FieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <div className={styles.control}>{children}</div>
      {helper && <p className={styles.helper} id={`${id}-helper`}>{helper}</p>}
    </div>
  )
}
