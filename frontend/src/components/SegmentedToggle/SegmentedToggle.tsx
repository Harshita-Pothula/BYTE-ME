import styles from './SegmentedToggle.module.css'

export interface ToggleOption {
  value: string
  label: string
  disabled?: boolean
}

interface SegmentedToggleProps {
  options: ToggleOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}

export default function SegmentedToggle({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedToggleProps) {
  return (
    <div
      className={styles.group}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const pressed = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className={`${styles.option}${
              pressed ? ` ${styles.selected}` : ''
            }${option.disabled ? ` ${styles.disabled}` : ''}`}
            aria-pressed={pressed}
            disabled={option.disabled || false}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
