import type { ReactNode } from "react";
import styles from "./Card.module.css";

export interface CardProps {
  children: ReactNode;
  padding?: "sm" | "md" | "lg";
}

export function Card({ children, padding = "md" }: CardProps) {
  return <div className={`${styles.card} ${styles[padding]}`}>{children}</div>;
}
