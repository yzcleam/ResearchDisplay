import { ArrowUpRight, CircleNotch, FolderOpen } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
export function Loading() {
  return (
    <div className="loading" role="status">
      <CircleNotch className="spin" size={22} /> 正在读取资料…
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={42} weight="light" />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Alert({ children }: { children: ReactNode }) {
  return children ? (
    <div className="alert" role="alert">
      {children}
    </div>
  ) : null;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function FileLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="file-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={15} />
    </a>
  );
}
export const date = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
export const size = (value: number) =>
  Number(value) < 1048576
    ? `${(Number(value) / 1024).toFixed(1)} KB`
    : `${(Number(value) / 1048576).toFixed(1)} MB`;
