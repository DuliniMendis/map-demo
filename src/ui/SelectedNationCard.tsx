import { useAppStore } from '../store/useAppStore';
import { useCardState } from './cardState';
import { InfoCard } from './InfoCard';

export interface SelectedNationCardProps {
  /** Hide the card while `cameraState === 'flying'` (PLAN.md §6: show it on `moveend`). Default true. */
  hideWhileFlying?: boolean;
  /** Extra work for "Back to overview" after `select(null)` (e.g. `controller.flyToOverview()`). */
  onBackToOverview?(): void;
  className?: string;
}

function focusAfterClose() {
  // The close button is about to unmount; put focus somewhere useful instead of <body>.
  const target =
    document.querySelector<HTMLElement>('.cm-panel [role="option"][aria-selected="true"]') ??
    document.querySelector<HTMLElement>('.cm-panel [data-testid="search-input"]');
  target?.focus({ preventScroll: true });
}

/** Container: shows `<InfoCard>` for the store's `selectedId`. Place it over the map. */
export function SelectedNationCard({
  hideWhileFlying = true,
  onBackToOverview,
  className,
}: SelectedNationCardProps) {
  const nation = useAppStore((s) =>
    s.selectedId ? (s.nations.find((n) => n.id === s.selectedId) ?? null) : null,
  );
  const flying = useAppStore((s) => s.cameraState === 'flying');
  const dismissedId = useCardState((s) => s.dismissedId);

  if (!nation || nation.id === dismissedId || (hideWhileFlying && flying)) return null;

  return (
    <InfoCard
      nation={nation}
      className={className}
      onClose={() => {
        useCardState.getState().dismiss(nation.id);
        focusAfterClose();
      }}
      onBackToOverview={() => {
        useAppStore.getState().select(null);
        onBackToOverview?.();
        focusAfterClose();
      }}
    />
  );
}
