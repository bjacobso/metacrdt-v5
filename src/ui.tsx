import { ReactNode } from "react";

// Small presentational primitives in the mockup's visual language. Keeping the
// long Tailwind strings here means the pages read cleanly.

export function shortId(s: string): string {
  return s.includes(":") ? s.split(":").slice(1).join(":") : s;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-ds border border-line bg-surface shadow-card ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  hint,
  right,
}: {
  title: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {right}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
      {children}
    </p>
  );
}

export function StatCard({
  icon,
  label,
  value,
  caption,
  tone = "ink",
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "ink" | "green";
}) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div
        className={`tnum mt-2 text-4xl font-semibold ${
          tone === "green" ? "text-green" : "text-ink"
        }`}
      >
        {value}
      </div>
      {caption && (
        <div
          className={`mt-1 text-[13px] ${
            tone === "green" ? "text-green" : "text-muted"
          }`}
        >
          {caption}
        </div>
      )}
    </Card>
  );
}

type ChipTone = "neutral" | "data" | "configured" | "system" | "brand";

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  const tones: Record<ChipTone, string> = {
    neutral: "bg-line-soft text-ink-2 border-line",
    data: "bg-green-soft text-green border-green/30",
    configured: "bg-blue-soft text-blue-ink border-blue/30",
    system: "bg-line-soft text-muted border-line",
    brand: "bg-brand text-white border-brand",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// Status badge for flow runs / event kinds.
const STATUS_TONE: Record<string, string> = {
  running: "bg-blue-soft text-blue-ink",
  waiting: "bg-orange-soft text-orange-ink",
  completed: "bg-green-soft text-green",
  expired: "bg-red-soft text-red-ink",
  cancelled: "bg-red-soft text-red-ink",
  open: "bg-orange-soft text-orange-ink",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "bg-line-soft text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}

type BtnVariant = "primary" | "outline" | "ghost" | "collect" | "reuse";

export function Button({
  children,
  onClick,
  disabled,
  type = "button",
  variant = "outline",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: BtnVariant;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-line";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-brand text-white hover:bg-brand-soft",
    outline: "border border-line bg-surface text-ink hover:bg-line-soft",
    ghost: "text-muted hover:bg-line-soft",
    collect:
      "border border-orange/30 bg-orange-soft text-orange-ink hover:bg-orange/15",
    reuse: "border border-green/30 bg-green-soft text-green hover:bg-green/15",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string },
) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-line ${className}`}
    />
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[12px] text-ink-2">{children}</code>;
}
