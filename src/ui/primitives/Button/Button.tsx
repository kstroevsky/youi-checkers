import type { ButtonHTMLAttributes } from 'react';

import { cx } from '@/shared/utils/cx';

import styles from './style.module.scss';

type ButtonVariant = 'solid' | 'ghost' | 'active';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className,
  fullWidth = false,
  type = 'button',
  variant = 'solid',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.root, fullWidth && styles.fullWidth, className)}
      data-variant={variant}
      {...props}
    >
      {children}
    </button>
  );
}
