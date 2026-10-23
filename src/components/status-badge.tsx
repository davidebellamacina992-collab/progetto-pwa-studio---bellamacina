export type StatusTone = "neutral" | "warning" | "success" | "danger" | "info";

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: StatusTone }) {
  return <span className={`statusBadge ${tone}`}>{children}</span>;
}
