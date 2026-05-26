import { useState } from 'react';

interface Props {
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  wheelImage: string;
  wheelName: string;
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

// Map make names to IMAGIN.studio format
function formatMake(make: string): string {
  const map: Record<string, string> = {
    'MERCEDES': 'Mercedes-Benz',
    'LAND ROVER': 'Land Rover',
    'ALFA ROMEO': 'Alfa Romeo',
    'BMW': 'BMW',
    'GMC': 'GMC',
    'RAM': 'RAM',
  };
  if (map[make]) return map[make];
  return make.charAt(0) + make.slice(1).toLowerCase();
}

import { getVehicleImgUrl, imaginErrorHandler } from '../lib/vehicle-img';

// Local templates have a single 3/4-front angle, no color variants. Picker
// args are kept for signature compatibility but not used.
function getCarImageUrl(make: string, model: string, year: string, _angle?: string, _paintId?: string): string {
  return getVehicleImgUrl(make, model, year);
}

export default function WheelVisualizer({ vehicleMake, vehicleModel, vehicleYear, wheelImage, wheelName }: Props) {
  const [activeColor, setActiveColor] = useState('default');
  const [activeAngle, setActiveAngle] = useState('01');
  const [imageError, setImageError] = useState(false);

  const carUrl = getCarImageUrl(vehicleMake, vehicleModel, vehicleYear, activeAngle, activeColor);

  return (
    <div className="bg-[var(--color-dark-900)] border border-[var(--color-dark-700)]/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--color-dark-700)]/30 flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">
          Preview on {vehicleYear} {formatMake(vehicleMake)} {formatModel(vehicleModel)}
        </h3>
        <span className="text-[var(--color-dark-500)] text-[10px]">Powered by IMAGIN.studio</span>
      </div>

      {/* Car + Wheel display */}
      <div className="bg-gradient-to-b from-[var(--color-dark-800)] to-[var(--color-dark-900)] p-4">
        <div className="grid grid-cols-3 gap-3 items-center">
          {/* Car image */}
          <div className="col-span-2 flex items-center justify-center min-h-[140px] sm:min-h-[180px]">
            {!imageError ? (
              <img
                src={carUrl}
                alt={`${vehicleYear} ${vehicleMake} ${vehicleModel}`}
                className="w-full h-auto max-h-[200px] object-contain"
                loading="lazy"
                onError={(e) => {
                  // First failure → IMAGIN fallback; if that also fails the
                  // image error state shows the textual placeholder.
                  const img = e.currentTarget;
                  if (img.dataset.fallbackTried !== '1') {
                    img.dataset.fallbackTried = '1';
                    imaginErrorHandler(vehicleMake, vehicleModel, vehicleYear)(e);
                  } else {
                    setImageError(true);
                  }
                }}
              />
            ) : (
              <div className="text-center text-[var(--color-dark-500)] text-xs">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth="1.5" />
                  <circle cx="7.5" cy="15" r="2" strokeWidth="1.5" />
                  <circle cx="16.5" cy="15" r="2" strokeWidth="1.5" />
                </svg>
                Vehicle image unavailable
              </div>
            )}
          </div>

          {/* Wheel image */}
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white rounded-xl p-3 w-full aspect-square flex items-center justify-center">
              <img
                src={wheelImage}
                alt={wheelName}
                className="w-full h-full object-contain mix-blend-multiply"
              />
            </div>
            <span className="text-[var(--color-dark-400)] text-[10px] text-center line-clamp-1">{wheelName}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-[var(--color-dark-700)]/30">
        {/* Color picker */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[var(--color-dark-500)] text-xs shrink-0">Color:</span>
          <div className="flex gap-1.5">
            {COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => { setActiveColor(c.id); setImageError(false); }}
                title={c.label}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  activeColor === c.id
                    ? 'border-[var(--color-primary-400)] scale-110'
                    : 'border-[var(--color-dark-600)] hover:border-[var(--color-dark-400)]'
                }`}
                style={{ backgroundColor: c.color }}
              />
            ))}
          </div>
        </div>

        {/* Angle picker */}
        <div className="flex items-center gap-3">
          <span className="text-[var(--color-dark-500)] text-xs shrink-0">Angle:</span>
          <div className="flex gap-1.5">
            {ANGLES.map(a => (
              <button
                key={a.id}
                onClick={() => { setActiveAngle(a.id); setImageError(false); }}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
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
  );
}
