export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  activeValue: T;
  onChange: (value: T) => void;
  'aria-label': string;
}

// Notion-style underline tab bar - a subtle "which view am I on" selector,
// deliberately distinct from FilterButton's pill/chip treatment (no bg-*
// fill anywhere here). Used for switching between complete, coherent
// presentations of the same list (e.g. the Students page's Behind-the-
// Wheel/Driver Education/All views), not for narrowing rows the way a
// filter chip does.
export function Tabs<T extends string>({ items, activeValue, onChange, 'aria-label': ariaLabel }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex items-center gap-6 border-b border-edge">
      {items.map((item) => {
        const isActive = item.value === activeValue;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.value)}
            className={`relative pb-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-t-sm ${
              isActive
                ? 'font-semibold text-tx-primary'
                : 'font-medium text-tx-muted hover:text-tx-secondary'
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={`ml-1.5 text-xs ${isActive ? 'text-tx-secondary' : 'text-tx-muted'}`}>
                ({item.count})
              </span>
            )}
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
