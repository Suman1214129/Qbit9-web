import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";
import { Spinner } from "./spinner";

type Variant = "primary" | "outline" | "soft" | "danger" | "link";
type Size = "md" | "sm" | "xl";

const base =
  "inline-flex items-center justify-center gap-2.5 font-medium tracking-[.1px] transition active:scale-[.985] disabled:opacity-50 disabled:active:scale-100 select-none";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-strong",
  outline: "text-primary shadow-[inset_0_0_0_1.5px_var(--color-primary)] hover:bg-primary/5",
  soft: "bg-rose text-deep hover:bg-rose/80",
  danger: "text-rust shadow-[inset_0_0_0_1.5px_var(--color-rust)] hover:bg-rust/5",
  link: "text-muted underline underline-offset-[3px] hover:text-ink",
};
const sizes: Record<Size, string> = {
  md: "h-[52px] rounded-btn px-5 text-[15px]",
  sm: "h-10 rounded-[14px] px-4 text-sm",
  xl: "h-[68px] rounded-[20px] px-6 text-lg",
};

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  href?: string;
  children: ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, icon, iconRight, block = true, href, className, children, disabled, type = "button", ...rest }: Props) {
  const cls = cn(base, variant === "link" ? "h-auto text-sm" : sizes[size], variants[variant], block && "w-full", className);
  const inner = (
    <>
      {loading ? <Spinner size={18} /> : icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
      {iconRight && !loading ? <Icon name={iconRight} size={18} /> : null}
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {inner}
    </button>
  );
}

/** Round white icon button (36px) used for back, expand and kebab. */
export function IconButton({ icon, label, className, ...rest }: { icon: IconName; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button type="button" aria-label={label} className={cn("flex size-9 items-center justify-center rounded-full bg-white shadow-ibn transition active:scale-95", className)} {...rest}>
      <Icon name={icon} size={18} />
    </button>
  );
}
