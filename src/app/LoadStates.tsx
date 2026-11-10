/** Side-panel placeholder while nations.json loads. */
export function ListSkeleton() {
  return (
    <div className="list-skeleton" role="status" aria-label="Loading nations and language groups">
      <div className="list-skeleton__title" />
      <div className="list-skeleton__search" />
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="list-skeleton__row" style={{ width: `${60 + ((i * 37) % 35)}%` }} />
      ))}
    </div>
  );
}

/** Side-panel error when nations.json fails to load. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <h2>Couldn’t load the nations list</h2>
      <p>Check your connection and try again. The map still works without it.</p>
      <details>
        <summary>Details</summary>
        <code>{message}</code>
      </details>
      <button type="button" className="btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/** Transient notice, e.g. "Using backup terrain". */
export function Toast({ message }: { message: string | null }) {
  return (
    <div className="toast" role="status" aria-live="polite" data-visible={Boolean(message)}>
      {message}
    </div>
  );
}
