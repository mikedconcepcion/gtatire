import { useEffect, useState } from 'react';
import ProductDetail from '../ProductDetail';
import CompatibleProducts from '../CompatibleProducts';
import ProductCard from '../ProductCard';
import { cdnUrl } from '../../lib/cdn';

// Reads /wheels/{id} from window.location, fetches products + fitment from the
// CDN, and renders the product detail page. Cloudflare _redirects rewrites all
// /wheels/* requests to a single shell page so this is the only file Cloudflare
// has to serve for any wheel detail URL — letting catalogue updates ship via
// `git push` (jsDelivr cache turnover) without a Pages rebuild.
export default function WheelDetailPage() {
  const [product, setProduct] = useState<any | null>(null);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [fitment, setFitment] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // URL pattern: /wheels/GTA-W-0001
    const match = window.location.pathname.match(/\/wheels\/([^/?#]+)/);
    const id = match ? decodeURIComponent(match[1]) : '';
    if (!id) { setLoading(false); return; }

    // Render the page as soon as products.json is ready (~4MB). fitment.json
    // is 24MB and only used for the distributor-only vehicle-fitment dropdown
    // (rendered conditionally on `isDistributor` in ProductDetail.tsx). Don't
    // block the main detail render on it.
    fetch(cdnUrl('/data/products.json'))
      .then(r => r.json())
      .then((prods) => {
        setAllProducts(prods);
        const p = prods.find((x: any) => x.id === id);
        setProduct(p || null);
        if (p) document.title = `${p.name || p.description} — JSDC Wheels`;
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch(cdnUrl('/data/fitment.json'))
      .then(r => r.json())
      .then(setFitment)
      .catch(() => {/* fitment is optional for public view */});
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center text-dark-500">
        Loading…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Product Not Found</h1>
        <a href="/wheels" className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">Browse Wheels</a>
      </div>
    );
  }

  const vehicleKeys = fitment[product.id] || [];
  const vehicles = vehicleKeys.map(k => {
    const [year, make, model] = k.split('|');
    return { year, make, model, url: `/vehicle/${year}/${make}/${model}` };
  });

  const similar = allProducts
    .filter(p => p.id !== product.id && p.rimDiameter === product.rimDiameter && p.boltPattern === product.boltPattern)
    .slice(0, 5);

  const specs = [
    { label: 'SKU', value: product.productNo },
    { label: 'Brand', value: product.brand || null },
    { label: 'Type', value: product.wheelType },
    { label: 'Size', value: product.rimDiameter && product.rimWidth ? `${product.rimDiameter}x${product.rimWidth}` : null },
    { label: 'Bolt Pattern', value: product.boltPattern || null },
    { label: 'Offset', value: product.offset !== null ? `ET${product.offset}` : null },
    { label: 'Hub Bore', value: product.hubBore ? `${product.hubBore}mm` : null },
    { label: 'Finish', value: product.finish || null },
    { label: 'Seat', value: product.seat || null },
    { label: 'Hub Centric', value: product.hubCentric ? 'Yes' : 'No' },
    { label: 'TPMS', value: product.tpmsCompatible || null },
    { label: 'Runflat', value: product.runflatCertified || null },
    { label: 'Load Rating', value: product.loadRating || null },
  ].filter(s => s.value);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <nav className="flex items-center gap-2 text-xs text-dark-500 mb-4">
        <a href="/" className="hover:text-dark-300">Home</a>
        <span>/</span>
        <a href="/wheels" className="hover:text-dark-300">Wheels</a>
        <span>/</span>
        <span className="text-dark-300">{product.productNo}</span>
      </nav>

      <ProductDetail product={product} vehicles={vehicles} specs={specs as any} />

      {product.rimDiameter && (
        <CompatibleProducts
          productCategory="wheel"
          rimDiameter={product.rimDiameter}
          boltPattern={product.boltPattern}
          priceNum={product.priceNum}
        />
      )}

      {similar.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Similar Wheels</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {similar.map(p => (
              <ProductCard
                key={p.id}
                id={p.id}
                image={p.image}
                brand={p.brand || p.supplier}
                model={p.name || (p.description || '').split(' ')[0]}
                description={p.description}
                size={p.boltPattern ? `${p.rimDiameter}" · ${p.boltPattern}` : `${p.rimDiameter}"`}
                price={p.price}
                compareAt={p.compareAt}
                stock={p.stock}
                type={p.wheelType}
                category="wheel"
                noImage={p.noImage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
