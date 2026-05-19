import { useEffect, useState } from 'react';
import ProductDetail from '../ProductDetail';
import CompatibleProducts from '../CompatibleProducts';
import ProductCard from '../ProductCard';
import { cdnUrl } from '../../lib/cdn';

// Mirrors WheelDetailPage for /tires/{id} — see that file for the rationale
// behind the catch-all hydrator pattern.
export default function TireDetailPage() {
  const [product, setProduct] = useState<any | null>(null);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const match = window.location.pathname.match(/\/tires\/([^/?#]+)/);
    const id = match ? decodeURIComponent(match[1]) : '';
    if (!id) { setLoading(false); return; }

    fetch(cdnUrl('/data/products.json'))
      .then(r => r.json())
      .then((prods) => {
        setAllProducts(prods);
        const p = prods.find((x: any) => x.id === id);
        setProduct(p || null);
        if (p) document.title = `${p.brand} ${p.name} ${p.tireSize || ''} — JSDC Wheels`;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center text-dark-500">Loading…</div>;
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Product Not Found</h1>
        <a href="/tires" className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">Browse Tires</a>
      </div>
    );
  }

  const similar = allProducts
    .filter(p => p.id !== product.id && p.category === 'tire' && p.rimDiameter === product.rimDiameter && p.tireWidth === product.tireWidth)
    .slice(0, 5);

  const specs = [
    { label: 'SKU', value: product.productNo || product.sku },
    { label: 'Brand', value: product.brand || null },
    { label: 'Model', value: product.name || null },
    { label: 'Type', value: product.wheelType },
    { label: 'Size', value: product.tireSize || null },
    { label: 'Rim Diameter', value: product.rimDiameter ? `${product.rimDiameter}"` : null },
  ].filter(s => s.value);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <nav className="flex items-center gap-2 text-xs text-dark-500 mb-4">
        <a href="/" className="hover:text-dark-300">Home</a>
        <span>/</span>
        <a href="/tires" className="hover:text-dark-300">Tires</a>
        <span>/</span>
        <span className="text-dark-300">{product.productNo || `${product.brand} ${product.name}`}</span>
      </nav>

      <ProductDetail product={product} vehicles={[]} specs={specs as any} />

      {product.rimDiameter && (
        <CompatibleProducts
          productCategory="tire"
          rimDiameter={product.rimDiameter}
          priceNum={product.priceNum}
        />
      )}

      {similar.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Similar Tires</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {similar.map(p => (
              <ProductCard
                key={p.id}
                id={p.id}
                image={p.image}
                brand={p.brand}
                model={p.name}
                description={p.description}
                size={p.tireSize || ''}
                price={p.price}
                compareAt={p.compareAt}
                stock={p.stock}
                type={p.wheelType}
                category="tire"
                noImage={p.noImage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
