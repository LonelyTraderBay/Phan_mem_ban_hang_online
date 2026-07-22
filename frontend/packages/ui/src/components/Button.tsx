import { forwardRef, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className, ...rest },
  ref,
) {
  return <button ref={ref} className={clsx(styles.button, styles[variant], className)} {...rest} />;
});
