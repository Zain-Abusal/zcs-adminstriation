import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({
  children,
  tone = "dashed",
  className,
}: {
  children: ReactNode;
  tone?: "dashed" | "cyan" | "yellow" | "mint" | "coral" | "ink";
  className?: string;
}) {
  const tones: Record<string, string> = {
    dashed: "border-dashed border-2 border-ink bg-transparent text-ink",
    cyan: "border-2 border-ink bg-accent text-ink",
    yellow: "border-2 border-ink bg-soft-yellow text-ink",
    mint: "border-2 border-ink bg-soft-mint text-ink",
    coral: "border-2 border-ink bg-soft-coral text-ink",
    ink: "border-2 border-ink bg-ink text-ink-foreground",
  };
  return (
    <span
      className={cn(
        "eyebrow mb-1 inline-flex items-center rounded-full px-3.5 py-1.5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  children,
  tone = "tint",
  className,
}: {
  children: ReactNode;
  tone?: "tint" | "yellow" | "mint" | "coral" | "plain";
  className?: string;
}) {
  const tones: Record<string, string> = {
    tint: "bg-accent-tint",
    yellow: "bg-soft-yellow",
    mint: "bg-soft-mint",
    coral: "bg-soft-coral",
    plain: "bg-paper-elevated",
  };
  return (
    <span
      className={cn(
        "mono inline-flex items-center rounded-md border-2 border-ink px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Sweep({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <span className={light ? "sweep-light" : "sweep"}>
      <span aria-hidden className={light ? "sweep-light-mark" : "sweep-mark"} />
      <span className="relative z-10">{children}</span>
    </span>
  );
}

export function Panel({
  children,
  className,
  tone = "paper",
}: {
  children: ReactNode;
  className?: string;
  tone?: "paper" | "ink" | "tint" | "yellow" | "mint" | "coral";
}) {
  const tones: Record<string, string> = {
    paper: "bg-paper-elevated text-foreground",
    ink: "bg-ink text-ink-foreground",
    tint: "bg-accent-tint text-foreground",
    yellow: "bg-soft-yellow text-foreground",
    mint: "bg-soft-mint text-foreground",
    coral: "bg-soft-coral text-foreground",
  };
  return <div className={cn("brut shadow-pop", tones[tone], className)}>{children}</div>;
}

const buttonBase =
  "mono inline-flex items-center justify-center gap-2 rounded-[14px] border-2 border-ink px-5 py-3 text-sm font-bold tracking-tight transition-[translate,box-shadow,background-color,border-color,color] duration-150 shadow-pop hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-pop-sm active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:pointer-events-none disabled:opacity-50";

export const buttonTones: Record<string, string> = {
  primary: "bg-accent text-ink hover:bg-accent-hover",
  paper: "bg-paper-elevated text-ink hover:bg-secondary",
  yellow: "bg-soft-yellow text-ink",
  ink: "bg-ink text-ink-foreground",
};

/** Shared pricing-page palette — dark "ink" section pieces, reused site-wide. */
export const darkPill =
  "mono inline-flex items-center gap-1.5 rounded-full border-2 border-ink-foreground/25 bg-ink-elevated px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-ink-muted";
export const darkBtn =
  "mono inline-flex items-center justify-center gap-2 rounded-[14px] border-2 border-ink-foreground/25 bg-ink-elevated px-5 py-3 text-sm font-bold tracking-tight text-ink-foreground transition-[background-color,border-color] duration-150 hover:border-ink-foreground/50";
export const whiteBtn =
  "mono inline-flex items-center justify-center gap-2 rounded-[14px] border-2 border-paper-elevated bg-paper-elevated px-5 py-3 text-sm font-bold tracking-tight text-ink transition-all duration-150 hover:bg-secondary";

export function btn(tone: keyof typeof buttonTones = "primary", className?: string) {
  return cn(buttonBase, buttonTones[tone], className);
}

export function Button({
  tone = "primary",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof buttonTones }) {
  return (
    <button className={btn(tone, className)} {...props}>
      {children}
    </button>
  );
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
    <label className="block">
      <span className="eyebrow mb-1.5 block text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[12px] border-2 border-ink bg-paper-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:shadow-pop-sm";

export function SectionHeading({
  eyebrow,
  eyebrowTone,
  title,
  sweep,
  lead,
  center,
  // Pages whose page heading is a SectionHeading render it as the single
  // <h1>; sections inside a page keep the default <h2>.
  as = "h2",
}: {
  eyebrow: string;
  eyebrowTone?: "dashed" | "cyan" | "yellow" | "mint" | "coral" | "ink";
  title: ReactNode;
  sweep?: string;
  lead?: string;
  center?: boolean;
  as?: "h1" | "h2";
}) {
  const Heading = as;
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <Eyebrow tone={eyebrowTone ?? "dashed"}>{eyebrow}</Eyebrow>
      <Heading className="display-xl mt-5 text-4xl sm:text-5xl">
        {title} {sweep ? <Sweep>{sweep}</Sweep> : null}
      </Heading>
      {lead ? <p className="mt-4 text-base text-muted-foreground sm:text-lg">{lead}</p> : null}
    </div>
  );
}
