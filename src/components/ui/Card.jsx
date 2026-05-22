import React from "react";

export default function Card({
  className = "",
  padded = true,
  children,
  ...props
}) {
  return (
    <div
      className={
        "bg-[var(--color-surface)] border border-[var(--color-line)] " +
        "rounded-[var(--radius-md)] " +
        (padded ? "p-6 " : "") +
        className
      }
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children, ...props }) {
  return (
    <div
      className={
        "border-b border-[var(--color-line)] pb-4 mb-4 " + className
      }
      {...props}
    >
      {children}
    </div>
  );
}

export function CardFooter({ className = "", children, ...props }) {
  return (
    <div
      className={
        "border-t border-[var(--color-line)] pt-4 mt-4 " + className
      }
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className = "", children, ...props }) {
  return (
    <h3
      className={
        "font-display text-lg font-medium tracking-tight text-[var(--color-ink)] " +
        className
      }
      {...props}
    >
      {children}
    </h3>
  );
}
