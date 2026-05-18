// TSX version of ProductCard.astro for use inside other React components
// (detail page hydrators). Kept visually identical to the .astro version so
// similar-product grids match between pre-rendered and client-rendered pages.
interface Props {
  id: string;
  image: string;
  brand: string;
  model: string;
  description: string;
  size: string;
  price: string;
  compareAt?: string;
  stock: string;
  type: string;
  category: 'tire' | 'wheel';
  noImage?: boolean;
}

const typeColors: Record<string, string> = {
  'All Season': 'bg-green-500/10 text-green-400 border-green-500/20',
  'Winter': 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  'All Weather': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Steel Wheel': 'bg-dark-500/10 text-dark-300 border-dark-500/20',
  'Alloy Wheel': 'bg-primary-500/10 text-primary-400 border-primary-500/20',
  'Alloy': 'bg-primary-500/10 text-primary-400 border-primary-500/20',
};

export default function ProductCard({ id, image, brand, model, description, size, price, compareAt, stock, type, category, noImage }: Props) {
  const typeClass = typeColors[type] || 'bg-dark-700/50 text-dark-300 border-dark-600';
  const stockStr = String(stock || '').trim();
  const stockNum = parseInt(stockStr, 10);
  const outOfStock = /out of stock/i.test(stockStr) || /^n\/?a$/i.test(stockStr) || /discontinu/i.test(stockStr);
  const lowStock = !outOfStock && !isNaN(stockNum) && stockNum >= 1 && stockNum < 10;
  const stockLabel = outOfStock ? 'Out of Stock' : lowStock ? `${stockNum} left` : 'In Stock';
  const stockColor = outOfStock ? 'text-red-400' : lowStock ? 'text-amber-400' : 'text-green-400';
  const showImage = image && !noImage;
  const isTire = category === 'tire';
  const priceNum = parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0;
  const inquiryName = `${brand || ''} ${model || ''}`.trim() || description;

  return (
    <a href={`/${category}s/${id}`} className="group bg-dark-900 border border-dark-700/50 rounded-xl overflow-hidden hover:border-primary-600/40 transition-all hover:shadow-lg hover:shadow-primary-900/10">
      <div className="aspect-square bg-white rounded-t-xl flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-dark-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        {showImage ? (
          <img src={image} alt={description} className="w-full h-full object-contain mix-blend-multiply" loading="lazy" decoding="async" />
        ) : isTire ? (
          <svg className="w-20 h-20 text-dark-400" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="50" cy="50" rx="45" ry="48" />
            <ellipse cx="50" cy="50" rx="30" ry="32" />
          </svg>
        ) : (
          <svg className="w-20 h-20 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="6" strokeWidth="1" />
            <circle cx="12" cy="12" r="2" strokeWidth="1.5" />
          </svg>
        )}
        <span className={`absolute top-3 left-3 text-xs font-medium px-2.5 py-1 rounded-full border ${typeClass}`}>
          {type}
        </span>
      </div>
      <div className="p-3 sm:p-4">
        <h3 className="text-white font-semibold text-xs sm:text-sm mb-0.5 line-clamp-1 group-hover:text-primary-300 transition-colors">{model}</h3>
        <p className="text-dark-400 text-[11px] line-clamp-1 mb-2">{size}</p>
        <div className="flex items-end justify-between mb-2">
          <div>
            <div className="text-white font-bold text-sm sm:text-lg">{price}</div>
            {compareAt && <div className="text-dark-500 text-[10px] line-through">{compareAt}</div>}
          </div>
          <div className={`text-[10px] sm:text-xs font-medium ${stockColor}`}>
            {stockLabel}
          </div>
        </div>
        <button
          type="button"
          className="jsdc-inquiry-trigger w-full inline-flex items-center justify-center gap-1 rounded-md font-semibold transition-colors px-2 py-1.5 text-[10px] sm:text-xs bg-primary-600/15 border border-primary-500/30 text-primary-200 hover:bg-primary-600/25 hover:text-white"
          data-inquiry-id={id}
          data-inquiry-name={inquiryName}
          data-inquiry-category={category}
          data-inquiry-image={image || ''}
          data-inquiry-size={size}
          data-inquiry-price={priceNum.toFixed(2)}
        >
          <svg className="w-3 h-3 jsdc-inquiry-plus" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
          <span className="jsdc-inquiry-label">Add to Inquiry</span>
        </button>
      </div>
    </a>
  );
}
