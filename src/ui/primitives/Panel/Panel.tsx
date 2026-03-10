import type { HTMLAttributes } from 'react';

import { cx } from '@/shared/utils/cx';

import styles from './style.module.scss';

type PanelElement = 'aside' | 'div' | 'section';

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: PanelElement;
};

export function Panel({ as = 'section', children, className, ...props }: PanelProps) {
  const Component = as;

  return (
    <Component className={cx(styles.root, className)} {...props}>
      {children}
    </Component>
  );
}
