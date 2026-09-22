import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: IconName;
  block?: boolean;
  children: ReactNode;
};

export function Button({
  variant = 'secondary',
  icon,
  block = false,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className="cb-button"
      data-variant={variant}
      data-block={block || undefined}
      {...rest}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      <span>{children}</span>
    </button>
  );
}
