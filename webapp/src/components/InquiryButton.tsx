import { useEffect, useState } from 'react';
import { addItem, removeItem, hasItem, INQUIRY_EVENT, type InquiryItem } from '../lib/inquiry';

type Props = {
  item: Omit<InquiryItem, 'qty'>;
  qty?: number;
  className?: string;
  size?: 'sm' | 'md';
};

// "Add to Inquiry" / "✓ Added (×N)" toggle. Click adds; click again removes.
// Stays in sync with localStorage via the global jsdc-inquiry-change event so
// the button reflects state if the item is added/removed elsewhere on the page.
export default function InquiryButton({ item, qty = 4, className = '', size = 'sm' }: Props) {
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setAdded(hasItem(item.id));
    const onChange = () => setAdded(hasItem(item.id));
    window.addEventListener(INQUIRY_EVENT, onChange);
    return () => window.removeEventListener(INQUIRY_EVENT, onChange);
  }, [item.id]);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (added) {
      removeItem(item.id);
    } else {
      addItem({ ...item, qty });
    }
  }

  const padding = size === 'md' ? 'px-3 py-2 text-xs' : 'px-2 py-1 text-[10px]';
  const base = `inline-flex items-center justify-center gap-1 rounded-md font-semibold transition-colors w-full ${padding}`;
  const addedStyles = 'bg-green-600/20 border border-green-500/40 text-green-300 hover:bg-green-600/30';
  const idleStyles = 'bg-primary-600/15 border border-primary-500/30 text-primary-200 hover:bg-primary-600/25 hover:text-white';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${added ? addedStyles : idleStyles} ${className}`}
      aria-pressed={added}
    >
      {added ? (
        <>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          Added (×{qty})
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add to Inquiry
        </>
      )}
    </button>
  );
}
