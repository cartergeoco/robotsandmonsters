import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, X } from "lucide-react";
import { RamGlyph, type RamGlyphName } from "./RamGlyph";
import { RamOrnament } from "./RamOrnament";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function RamPanel({
  children,
  className,
  journal = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { journal?: boolean }) {
  return (
    <section className={cx("ram-panel", journal && "ram-panel--journal", className)} {...props}>
      {children}
    </section>
  );
}

export function RamPanelHeader({
  title,
  actions,
  className,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("ram-panel-header", className)}>
      <div className="ram-panel-header__copy">
        <h2>{title}</h2>
      </div>
      {actions && <div className="ram-panel-header__actions">{actions}</div>}
    </header>
  );
}

export function RamPanelBody({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("ram-panel-body", className)} {...props}>
      {children}
    </div>
  );
}

export function RamSection({
  title,
  glyph,
  action,
  children,
  className,
  journal = false,
}: {
  title?: string;
  glyph?: RamGlyphName;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  journal?: boolean;
}) {
  return (
    <section className={cx("ram-section", journal && "ram-section--journal", className)}>
      {title && (
        <div className="ram-section__heading">
          {glyph && <RamGlyph name={glyph} size={16} />}
          <h3>{title}</h3>
          <span className="ram-section__line" />
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function RamDivider({ variant = 1 }: { variant?: 1 | 2 }) {
  return (
    <div className="ram-divider">
      <RamOrnament name={variant === 1 ? "divider-01" : "divider-02"} />
    </div>
  );
}

type RamButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "world";

export function RamButton({
  children,
  className,
  variant = "secondary",
  size = "md",
  icon: Icon,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: RamButtonVariant;
  size?: "sm" | "md";
  icon?: LucideIcon;
}) {
  return (
    <button
      className={cx("ram-button", `ram-button--${variant}`, `ram-button--${size}`, className)}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={1.5} />}
      <span>{children}</span>
    </button>
  );
}

export function RamIconButton({
  children,
  className,
  variant = "ghost",
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "danger" | "brass";
  label: string;
}) {
  return (
    <button
      className={cx("ram-icon-button", `ram-icon-button--${variant}`, className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export const RamInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function RamInput({ className, ...props }, ref) {
    return <input ref={ref} className={cx("ram-input", className)} {...props} />;
  }
);

export const RamTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function RamTextarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx("ram-textarea", className)} {...props} />;
});

export const RamSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function RamSelect({ className, ...props }, ref) {
    return (
      <span className={cx("ram-select-shell", className)}>
        <select ref={ref} className="ram-select" {...props} />
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
      </span>
    );
  }
);

export function RamField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("ram-field", className)}>
      <span className="ram-field__label">{label}</span>
      {children}
      {hint && <span className="ram-field__hint">{hint}</span>}
    </label>
  );
}

export function RamBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brass" | "olive" | "danger" | "positive";
  className?: string;
}) {
  return <span className={cx("ram-badge", `ram-badge--${tone}`, className)}>{children}</span>;
}

export function RamStat({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "brass" | "positive" | "danger";
}) {
  return (
    <div className={cx("ram-stat", `ram-stat--${tone}`)}>
      <span className="ram-stat__label">{label}</span>
      <strong>{value}</strong>
      {detail && <span className="ram-stat__detail">{detail}</span>}
    </div>
  );
}

export function RamCard({
  children,
  selected = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div className={cx("ram-card", selected && "is-selected", className)} {...props}>
      {children}
    </div>
  );
}

export function RamCharacterCard({
  name,
  meta,
  level,
  hp,
  maxHp,
  selected,
  onClick,
}: {
  name: string;
  meta: string;
  level: number;
  hp: number;
  maxHp: number;
  selected: boolean;
  onClick: () => void;
}) {
  const fraction = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const tone = fraction > 0.5 ? "positive" : fraction > 0.25 ? "brass" : "danger";
  return (
    <button
      className={cx("ram-character-card", selected && "is-selected")}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="ram-character-card__body">
        <span className="ram-character-card__heading">
          <strong>{name}</strong>
          <RamBadge tone={selected ? "brass" : "neutral"}>LV {level}</RamBadge>
        </span>
        <span className="ram-character-card__meta">{meta}</span>
        <span className="ram-health">
          <span className="ram-health__track">
            <span
              className={cx("ram-health__fill", `ram-health__fill--${tone}`)}
              style={{ width: `${fraction * 100}%` }}
            />
          </span>
          <span className="ram-health__value">
            {hp}/{maxHp}
          </span>
        </span>
      </span>
    </button>
  );
}

export function RamTokenFrame({
  glyph = "player",
  label,
  tone = "brass",
}: {
  glyph?: RamGlyphName;
  label?: string;
  tone?: "brass" | "olive" | "danger" | "neutral";
}) {
  return (
    <span className={cx("ram-token-frame", `ram-token-frame--${tone}`)}>
      <RamOrnament name="frame-circle" />
      <RamGlyph name={glyph} size={22} />
      {label && <small>{label}</small>}
    </span>
  );
}

export function RamJournalPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={cx("ram-journal", className)}>
      <span className="ram-journal__pin" />
      <h3>{title}</h3>
      <RamDivider variant={1} />
      <div>{children}</div>
    </article>
  );
}

export function RamTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="ram-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          className={value === tab.value ? "is-active" : ""}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "ArrowLeft" &&
              event.key !== "ArrowRight" &&
              event.key !== "Home" &&
              event.key !== "End"
            ) {
              return;
            }
            event.preventDefault();
            const index = tabs.findIndex((item) => item.value === value);
            const nextIndex =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                    tabs.length;
            const next = tabs[nextIndex];
            onChange(next.value);
            const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
              '[role="tab"]'
            );
            buttons?.[nextIndex]?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function RamTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="ram-tooltip" data-tooltip={label}>
      {children}
    </span>
  );
}

export function RamMenu({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("ram-menu", className)}>{children}</div>;
}

export function RamDialog({
  open,
  title,
  children,
  onClose,
  className,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="ram-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={cx("ram-dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <RamPanelHeader
          title={title}
          actions={
            <RamIconButton label="Close" onClick={onClose}>
              <X size={16} strokeWidth={1.5} />
            </RamIconButton>
          }
        />
        <div className="ram-dialog__body">{children}</div>
      </div>
    </div>
  );
}

export function RamConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <RamDialog open={open} title={title} onClose={onClose} className="confirm-dialog">
      <p className="confirm-dialog__message">{description}</p>
      <div className="ram-dialog__actions">
        <RamButton variant="ghost" onClick={onClose}>
          Cancel
        </RamButton>
        <RamButton
          variant="danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </RamButton>
      </div>
    </RamDialog>
  );
}

