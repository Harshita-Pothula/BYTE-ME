import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'dark'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: React.ReactNode
  isLoading?: boolean
}

export default function Button({
  variant = 'primary',
  icon,
  isLoading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${styles.btn} ${styles[variant]}${
        className ? ` ${className}` : ''
      }`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <span className={styles.loading} aria-hidden="true" /> : icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  )
}
