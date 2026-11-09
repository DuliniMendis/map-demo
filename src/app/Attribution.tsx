import { useId, useState } from 'react';
import { compactLabel, type AttributionEntry } from './attributionData';

/** Always-visible compact credit line (bottom-right); expands to the full list on click. */
export function Attribution({ entries }: { entries: AttributionEntry[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <div className="attribution" data-testid="attribution" data-expanded={open}>
      {open && (
        <ul id={listId} className="attribution__list">
          {entries.map((e) => (
            <li key={e.id}>
              {e.url ? (
                <a href={e.url} target="_blank" rel="noreferrer">
                  {e.text}
                </a>
              ) : (
                e.text
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="attribution__line"
        aria-expanded={open}
        aria-controls={listId}
        title={open ? 'Hide full attribution' : 'Show full attribution'}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">ⓘ</span> {entries.map(compactLabel).join(' · ')}
      </button>
    </div>
  );
}
