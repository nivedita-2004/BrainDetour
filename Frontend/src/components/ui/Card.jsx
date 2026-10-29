import './Card.css'
import { classNames } from '../../lib/utils'

/**
 * Reusable Card container component adhering to the pastel-lavender surface styling.
 */
export function Card({ children, className = '', hoverable = false, ...restProps }) {
  return (
    <div
      className={classNames('ui-card', hoverable && 'ui-card--hoverable', className)}
      {...restProps}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', ...restProps }) {
  return (
    <div className={classNames('ui-card-header', className)} {...restProps}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '', as: Component = 'h3', ...restProps }) {
  return (
    <Component className={classNames('ui-card-title', className)} {...restProps}>
      {children}
    </Component>
  )
}

export function CardDescription({ children, className = '', ...restProps }) {
  return (
    <p className={classNames('ui-card-description', className)} {...restProps}>
      {children}
    </p>
  )
}

export function CardContent({ children, className = '', ...restProps }) {
  return (
    <div className={classNames('ui-card-content', className)} {...restProps}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '', ...restProps }) {
  return (
    <div className={classNames('ui-card-footer', className)} {...restProps}>
      {children}
    </div>
  )
}
