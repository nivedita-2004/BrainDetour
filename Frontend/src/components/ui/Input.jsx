import './Input.css'
import { classNames } from '../../lib/utils'

/**
 * Reusable text input component with soft claymorphic depth, icon slots, and show/hide controls.
 */
export function Input({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  helperText,
  icon,
  rightSlot,
  disabled = false,
  required = false,
  className = '',
  ...restProps
}) {
  return (
    <div className={classNames('ui-input-wrapper', className)}>
      {label && (
        <label htmlFor={id} className="ui-input-label">
          {label}
          {required && <span className="ui-input-required">*</span>}
        </label>
      )}
      <div
        className={classNames(
          'ui-input-box',
          icon && 'ui-input-box--has-icon',
          rightSlot && 'ui-input-box--has-right'
        )}
      >
        {icon && <span className="ui-input-icon" aria-hidden="true">{icon}</span>}
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={classNames(
            'ui-input-field',
            icon && 'ui-input-field--with-icon',
            rightSlot && 'ui-input-field--with-right',
            error && 'ui-input-field--error',
            disabled && 'ui-input-field--disabled'
          )}
          {...restProps}
        />
        {rightSlot && <div className="ui-input-right-slot">{rightSlot}</div>}
      </div>
      {error && <span className="ui-input-error">{error}</span>}
      {!error && helperText && <span className="ui-input-helper">{helperText}</span>}
    </div>
  )
}
