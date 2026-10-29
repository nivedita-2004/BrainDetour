import './Button.css'
import { classNames } from '../../lib/utils'

/**
 * Reusable Button component supporting multiple design system variants and sizes.
 */
export function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  ...restProps
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={classNames(
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        disabled && 'ui-button--disabled',
        className
      )}
      {...restProps}
    >
      {children}
    </button>
  )
}
