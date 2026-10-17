import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-rose text-deep">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="mt-1 text-[17px] font-semibold">{title}</h3>
      {children ? <p className="max-w-[32ch] text-sm leading-snug text-muted">{children}</p> : null}
      {action ? <div className="mt-3 w-full max-w-[260px]">{action}</div> : null}
    </div>
  );
}

export function InlineNote({ icon = "info", children, tone = "muted" }: { icon?: IconName; children: ReactNode; tone?: "muted" | "warn" }) {
  return (
    <p className={tone === "warn" ? "flex gap-2 rounded-2xl bg-peach px-3.5 py-3 text-[13px] leading-snug" : "flex items-start gap-2 text-xs leading-snug text-muted"}>
      <Icon name={icon} size={14} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
