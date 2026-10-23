import Link from "next/link";
import type { Route } from "next";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: Route;
  actionLabel?: string;
}) {
  return (
    <div className="emptyState">
      <span className="emptyIcon" aria-hidden="true">✓</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {actionHref && actionLabel ? (
        <Link className="button secondary" href={actionHref}>{actionLabel}</Link>
      ) : null}
    </div>
  );
}
