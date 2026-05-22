import React from "react";

export default function Table({ className = "", children, ...props }) {
  return (
    <div className="overflow-x-auto border border-[var(--color-line)] rounded-[var(--radius-md)]">
      <table
        className={
          "w-full text-sm border-collapse " + className
        }
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ className = "", children, ...props }) {
  return (
    <thead
      className={
        "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)] " +
        "text-xs uppercase tracking-wide " + className
      }
      {...props}
    >
      {children}
    </thead>
  );
}

export function TBody({ className = "", children, ...props }) {
  return (
    <tbody
      className={"divide-y divide-[var(--color-line)] " + className}
      {...props}
    >
      {children}
    </tbody>
  );
}

export function TR({ className = "", children, ...props }) {
  return (
    <tr
      className={
        "transition-colors duration-150 hover:bg-[var(--color-surface-muted)]/60 " +
        className
      }
      {...props}
    >
      {children}
    </tr>
  );
}

export function TH({ className = "", numeric = false, children, ...props }) {
  return (
    <th
      scope="col"
      className={
        "px-4 py-3 font-medium " +
        (numeric ? "text-right tabular-nums " : "text-left ") +
        className
      }
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({ className = "", numeric = false, children, ...props }) {
  return (
    <td
      className={
        "px-4 py-3 align-middle " +
        (numeric
          ? "text-right font-mono tabular-nums text-[var(--color-ink)] "
          : "text-[var(--color-ink)] ") +
        className
      }
      {...props}
    >
      {children}
    </td>
  );
}
