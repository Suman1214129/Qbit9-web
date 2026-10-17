import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

/** Dashed-divider row used on Profile, Alerts and Review. Renders a link, a button or a plain row. */
export function ListRow({ icon, title, value, sub, href, onClick, trailing, className, danger, dividers = true }: {
  icon?: IconName;
  title: ReactNode;
  value?: ReactNode;
  sub?: ReactNode;
  href?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
  danger?: boolean;
  dividers?: boolean;
}) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      {icon ? <Icon name={icon} size={20} className={danger ? "text-rust" : "text-primary-strong"} /> : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[15px]">{title}</span>
        {sub ? <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{sub}</span> : null}
      </span>
      {value ? <span className="text-[13px] text-muted">{value}</span> : null}
      {trailing ?? (interactive ? <Icon name="chev" size={16} className="text-muted" /> : null)}
    </>
  );
  const cls = cn("flex w-full items-center gap-3 px-0.5 py-3", dividers && "border-b border-dashed border-line", interactive && "transition-colors hover:bg-ink/[.025]", className);
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/** Key/value line used on review and token details. */
export function StatRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b border-dashed border-line py-3 text-[13.5px] last:border-b-0", className)}>
      <span className="text-muted">{label}</span>
      <span className="text-right text-[14.5px] font-medium">{children}</span>
    </div>
  );
}
