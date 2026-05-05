import { useState, useEffect } from 'react';

interface Props {
  wheelImage: string;
  wheelName: string;
  vehicles: { year: string; make: string; model: string }[];
}

const COLORS = [
  { id: 'default', label: 'Silver', color: '#C0C0C0' },
  { id: 'pspc0014', label: 'Black', color: '#1a1a1a' },
  { id: 'pspc0087', label: 'Red', color: '#cc2a36' },
  { id: 'pspc0071', label: 'Blue', color: '#2a5cc7' },
  { id: 'pspc0066', label: 'White', color: '#f0f0f0' },
  { id: 'pspc0074', label: 'Grey', color: '#6b6b6b' },
];

const ANGLES = [
  { id: '01', label: '3/4 Front' },
  { id: '05', label: 'Side' },
  { id: '09', label: '3/4 Rear' },
];

function formatMake(make: string): string {
  const map: Record<string, string> = {
    'MERCEDES': 'Mercedes-Benz', 'LAND ROVER': 'Land Rover',
    'ALFA ROMEO': 'Alfa Romeo', 'BMW': 'BMW', 'GMC': 'GMC', 'RAM': 'RAM',
  };
  return map[make] || make.charAt(0) + make.slice(1).toLowerCase();
}

function formatModel(model: string): string {
  return model.split(' ').map(w =>
    w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ');
}

function getCarUrl(make: string, model: string, year: string, angle: string, paintId?: string): string {
  const params = new URLSearchParams({
    customer: 'img', make: formatMake(make), modelFamily: formatModel(model),
    modelYear: year, angle, width: '800', fileType: 'png',
  });
  if (paintId && paintId !== 'default') params.set('paintId', paintId);
  return `https://cdn.imagin.studio/getImage?${params.toString()}`;
}

// Get unique makes from vehicles for the vehicle picker
function getUniqueMakes(vehicles: Props['vehicles']): string[] {
  return [...new Set(vehicles.map(v => v.make))].sort();
}

function getModelsForMake(vehicles: Props['vehicles'], make: string): string[] {
  return [...new Set(vehicles.filter(v => v.make === make).map(v => v.model))].sort();
}

function getYearsForModel(vehicles: Props['vehicles'], make: string, model: string): string[] {
  return [...new Set(vehicles.filter(v => v.make === make && v.model === model).map(v => v.year))].sort().reverse();
}

export default function WheelVisualizerModal({ wheelImage, wheelName, vehicles }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeColor, setActiveColor] = useState('default');
  const [activeAngle, setActiveAngle] = useState('01');
  const [imageError, setImageError] = useState(false);

  // Vehicle picker state
  const makes = getUniqueMakes(vehicles);
  const [selMake, setSelMake] = useState(vehicles[0]?.make || '');
  const [selModel, setSelModel] = useState(vehicles[0]?.model || '');
  const [selYear, setSelYear] = useState(vehicles[0]?.year || '');

  const models = selMake ? getModelsForMake(vehicles, selMake) : [];
  const years = selMake && selModel ? getYearsForModel(vehicles, selMake, selModel) : [];

  // Auto-select first model/year when make changes
  useEffect(() => {
    if (selMake && models.length > 0 && !models.includes(selModel)) {
      setSelModel(models[0]);
    }
  }, [selMake]);

  useEffect(() => {
    if (selModel && years.length > 0 && !years.includes(selYear)) {
      setSelYear(years[0]);
    }
  }, [selModel]);

  const carUrl = selMake && selModel && selYear
    ? getCarUrl(selMake, selModel, selYear, activeAngle, activeColor)
    : '';

  // Close on escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setIsOpen(false); }
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const selectCls = "bg-[var(--color-dark-800)] border border-[var(--color-dark-600)] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]";

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-full bg-[var(--color-dark-800)] hover:bg-[var(--color-dark-700)] text-[var(--color-dark-300)] hover:text-white py-2.5 rounded-lg text-sm font-medium transition-colors border border-[var(--color-dark-600)] flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth="1.5" />
          <circle cx="7.5" cy="15" r="1.5" strokeWidth="1.5" />
          <circle cx="16.5" cy="15" r="1.5" strokeWidth="1.5" />
        </svg>
        See on Your Car
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

          {/* Content */}
          <div className="relative bg-[var(--color-dark-900)] border border-[var(--color-dark-700)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-dark-700)]/50">
              <h3 className="text-white font-semibold text-sm">Wheel Preview</h3>
              <button onClick={() => setIsOpen(false)} className="text-[var(--color-dark-400)] hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Vehicle picker */}
            <div className="px-4 py-3 border-b border-[var(--color-dark-700)]/30 flex flex-wrap items-center gap-2">
              <span className="text-[var(--color-dark-500)] text-xs">Vehicle:</span>
              <select value={selMake} onChange={e => { setSelMake(e.target.value); setImageError(false); }} className={selectCls}>
                {makes.map(m => <option key={m} value={m}>{formatMake(m)}</option>)}
              </select>
              <select value={selModel} onChange={e => { setSelModel(e.target.value); setImageError(false); }} className={selectCls}>
                {models.map(m => <option key={m} value={m}>{formatModel(m)}</option>)}
              </select>
              <select value={selYear} onChange={e => { setSelYear(e.target.value); setImageError(false); }} className={selectCls}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Preview area */}
            <div className="bg-gradient-to-b from-[var(--color-dark-800)] to-[var(--color-dark-950)] p-6">
              <div className="grid grid-cols-4 gap-4 items-center">
                {/* Car */}
                <div className="col-span-3 flex items-center justify-center min-h-[200px]">
                  {carUrl && !imageError ? (
                    <img
                      src={carUrl}
                      alt={`${selYear} ${selMake} ${selModel}`}
                      className="w-full h-auto max-h-[280px] object-contain"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className="text-center text-[var(--color-dark-500)] text-xs">
                      <svg className="w-16 h-16 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth="1.5" />
                        <circle cx="7.5" cy="15" r="2" strokeWidth="1.5" />
                        <circle cx="16.5" cy="15" r="2" strokeWidth="1.5" />
                      </svg>
                      Image unavailable for this vehicle
                    </div>
                  )}
                </div>

                {/* Wheel */}
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-white rounded-xl p-3 aspect-square flex items-center justify-center">
                    <img src={wheelImage} alt={wheelName} className="w-full h-full object-contain mix-blend-multiply" />
                  </div>
                  <span className="text-[var(--color-dark-400)] text-[10px] text-center leading-tight">{wheelName}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="px-4 py-3 border-t border-[var(--color-dark-700)]/30 space-y-2">
              {/* Colors */}
              <div className="flex items-center gap-3">
                <span className="text-[var(--color-dark-500)] text-xs shrink-0">Color:</span>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setActiveColor(c.id); setImageError(false); }}
                      title={c.label}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        activeColor === c.id
                          ? 'border-[var(--color-primary-400)] scale-110 shadow-lg'
                          : 'border-[var(--color-dark-600)] hover:border-[var(--color-dark-400)]'
                      }`}
                      style={{ backgroundColor: c.color }}
                    />
                  ))}
                </div>
              </div>

              {/* Angles */}
              <div className="flex items-center gap-3">
                <span className="text-[var(--color-dark-500)] text-xs shrink-0">Angle:</span>
                <div className="flex gap-1.5">
                  {ANGLES.map(a => (
                    <button
                      key={a.id}
                      onClick={() => { setActiveAngle(a.id); setImageError(false); }}
                      className={`text-xs px-3 py-1 rounded-full border transition-all ${
                        activeAngle === a.id
                          ? 'bg-[var(--color-primary-600)] text-white border-[var(--color-primary-600)]'
                          : 'text-[var(--color-dark-400)] border-[var(--color-dark-600)] hover:text-white'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
