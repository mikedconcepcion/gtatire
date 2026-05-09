import { AuthProvider, useAuth } from './auth/AuthProvider';
import PriceDisplay from './auth/PriceDisplay';
import WheelVisualizerModal from './WheelVisualizerModal';

interface Product {
  id: string;
  productNo: string;
  supplier: string;
  brand: string;
  wheelType: string;
  name: string;
  description: string;
  image: string;
  images?: string[];
  price: string;
  priceNum: number;
  distPrice: string;
  compareAt: string;
  stock: string;
  hubCentric: boolean;
  rimDiameter: number | null;
  rimWidth: number | null;
  boltPattern: string;
  offset: number | null;
  hubBore: number | null;
  finish: string;
  seat?: string;
}

interface Vehicle {
  year: string;
  make: string;
  model: string;
  url: string;
}

interface Props {
  product: Product;
  vehicles: Vehicle[];
  specs: { label: string; value: string }[];
}

function ProductDetailInner({ product, vehicles, specs }: Props) {
  const { isDistributor } = useAuth();

  // Group vehicles by make
  const vehiclesByMake: Record<string, Vehicle[]> = {};
  for (const v of vehicles) {
    if (!vehiclesByMake[v.make]) vehiclesByMake[v.make] = [];
    vehiclesByMake[v.make].push(v);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 sm:gap-5 mb-8">
      {/* Image — centered, bigger on mobile */}
      <div className="md:col-span-2 bg-white border border-[var(--color-dark-700)]/50 rounded-xl p-6 sm:p-4 flex items-center justify-center aspect-square mx-auto w-full max-w-[300px] md:max-w-none">
        {product.image ? (
          <img src={product.image} alt={product.description} className="max-w-full max-h-full object-contain mix-blend-multiply" />
        ) : (
          <svg className="w-32 h-32 text-[var(--color-dark-600)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="6" strokeWidth="1" />
            <circle cx="12" cy="12" r="2" strokeWidth="1.5" />
          </svg>
        )}
      </div>

      {/* Info — centered on mobile */}
      <div className="md:col-span-3 text-center md:text-left">
        <div className="flex items-center justify-center md:justify-start gap-2 mb-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
            product.wheelType === 'Alloy Wheel'
              ? 'bg-[var(--color-primary-500)]/10 text-[var(--color-primary-400)] border-[var(--color-primary-500)]/20'
              : 'bg-[var(--color-dark-500)]/10 text-[var(--color-dark-300)] border-[var(--color-dark-500)]/20'
          }`}>{product.wheelType}</span>
          {product.hubCentric && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Hub Centric</span>
          )}
          {isDistributor && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Distributor</span>
          )}
        </div>

        <h1 className="text-lg font-bold text-white mb-1">{product.name || product.description.split(' ')[0]}</h1>
        <p className="text-[var(--color-dark-400)] text-xs mb-3">{product.description}</p>

        {/* Price — auth aware */}
        <div className="mb-3 flex justify-center md:justify-start">
          <PriceDisplay price={product.price} compareAt={product.compareAt} distPrice={product.distPrice} stock={product.stock} />
        </div>

        {/* CTA */}
        <div className="flex gap-2 mb-3 justify-center md:justify-start">
          <a
            href={`mailto:james@jsdcwheels.ca?subject=Inquiry: ${product.productNo}&body=Hi, I'm interested in ${product.description} (${product.productNo}).`}
            className="bg-[var(--color-primary-600)] hover:bg-[var(--color-primary-700)] text-white font-medium py-2 px-5 rounded-lg text-sm transition-colors"
          >
            {isDistributor ? 'Place Order' : 'Contact for Pricing'}
          </a>
          <a href="/gtatire/contact" className="bg-[var(--color-dark-800)] hover:bg-[var(--color-dark-700)] text-[var(--color-dark-300)] hover:text-white py-2 px-5 rounded-lg text-sm transition-colors border border-[var(--color-dark-600)]">
            Call Us
          </a>
        </div>

        {/* See on Your Car */}
        {vehicles.length > 0 && product.image && (
          <div className="mb-4">
            <WheelVisualizerModal
              wheelImage={product.image}
              wheelName={product.name || product.description}
              vehicles={vehicles}
            />
          </div>
        )}

        {/* Specs */}
        <div className="bg-[var(--color-dark-900)] border border-[var(--color-dark-700)]/50 rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 text-xs sm:text-sm">
            {specs.map((s, i) => (
              <div key={s.label} className={`flex justify-between px-3 sm:px-4 py-2 border-b border-[var(--color-dark-700)]/30 ${i % 2 === 0 ? 'sm:border-r' : ''} last:border-b-0`}>
                <span className="text-[var(--color-dark-500)]">{s.label}</span>
                <span className="text-white font-medium">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fitment — distributor only */}
        {isDistributor && vehicles.length > 0 && (
          <details className="mt-4 bg-[var(--color-dark-900)] border border-[var(--color-dark-700)]/50 rounded-lg">
            <summary className="px-4 py-2.5 cursor-pointer text-white font-medium text-xs flex items-center justify-between">
              <span>Vehicle Fitment ({vehicles.length})</span>
              <svg className="w-3.5 h-3.5 text-[var(--color-dark-400)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </summary>
            <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 border-t border-[var(--color-dark-700)]/30 pt-2">
              {Object.entries(vehiclesByMake).sort().map(([makeName, models]) => (
                <div key={makeName}>
                  <div className="text-[var(--color-primary-400)] text-[10px] font-semibold mb-0.5">{makeName}</div>
                  {models.sort((a, b) => b.year.localeCompare(a.year)).map(v => (
                    <a key={`${v.year}-${v.model}`} href={v.url} className="block text-[var(--color-dark-400)] hover:text-white text-[11px] transition-colors leading-relaxed">
                      {v.year} {v.model}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// Wrapped with AuthProvider
export default function ProductDetail(props: Props) {
  return (
    <AuthProvider>
      <ProductDetailInner {...props} />
    </AuthProvider>
  );
}
