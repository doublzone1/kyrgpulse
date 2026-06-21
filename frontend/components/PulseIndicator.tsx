"use client";

interface Props {
  label?: string;
  variant?: "inline" | "full";
  className?: string;
}

export default function PulseIndicator({
  label,
  variant = "inline",
  className = "",
}: Props) {
  if (variant === "full") {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <span className="pulse-dot" aria-hidden />
        <div className="ecg-line flex-1">
          <div className="ecg-stroke" />
        </div>
        {label && (
          <span className="text-[11px] uppercase tracking-[0.18em] text-primary-400">
            {label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2.5 text-[11px] uppercase tracking-[0.16em] text-primary-400 ${className}`}
    >
      <span className="pulse-dot" aria-hidden />
      <span className="relative w-12 h-[2px] overflow-hidden bg-primary-500/10">
        <span className="absolute inset-0">
          <span className="ecg-stroke" />
        </span>
      </span>
      {label && <span>{label}</span>}
    </div>
  );
}
