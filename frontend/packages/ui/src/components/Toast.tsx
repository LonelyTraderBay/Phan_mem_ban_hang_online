import * as ToastPrimitive from "@radix-ui/react-toast";
import type { ReactNode } from "react";
import styles from "./Toast.module.css";

export type ToastVariant = "info" | "success" | "danger";

export interface ToastProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  variant?: ToastVariant;
}

export function Toast({ open, onOpenChange, title, description, variant = "info" }: ToastProps) {
  return (
    <ToastPrimitive.Root className={styles.root} data-variant={variant} open={open} onOpenChange={onOpenChange}>
      <ToastPrimitive.Title className={styles.title}>{title}</ToastPrimitive.Title>
      {description && <ToastPrimitive.Description>{description}</ToastPrimitive.Description>}
    </ToastPrimitive.Root>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider>
      {children}
      <ToastPrimitive.Viewport className={styles.viewport} />
    </ToastPrimitive.Provider>
  );
}
