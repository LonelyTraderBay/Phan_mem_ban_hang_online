import type { AnchorHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import styles from "./TextLink.module.css";

export interface TextLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  muted?: boolean;
}

export function TextLink({ children, muted, className, ...rest }: TextLinkProps) {
  return (
    <a className={clsx(styles.link, muted && styles.muted, className)} {...rest}>
      {children}
    </a>
  );
}
