import { useAuth } from './AuthProvider';

interface Props {
  price: string;
  compareAt: string;
  distPrice?: string;
  stock: string;
}

export default function PriceDisplay({ price, compareAt, distPrice, stock }: Props) {
  const { isDistributor } = useAuth();

  const s = String(stock || '').trim();
  const n = parseInt(s, 10);
  const out = /out of stock/i.test(s) || /^n\/?a$/i.test(s) || /discontinu/i.test(s);
  const low = !out && !isNaN(n) && n >= 1 && n < 10;

  const priceNum = parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0;
  const availability = out ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';

  return (
    <div itemProp="offers" itemScope itemType="https://schema.org/Offer">
      <meta itemProp="priceCurrency" content="CAD" />
      <link itemProp="availability" href={availability} />
      {isDistributor && distPrice ? (
        <div className="flex items-end gap-3 justify-center md:justify-start">
          <div>
            <div className="text-dark-500 text-[10px] uppercase tracking-wider">Wholesale</div>
            <div className="text-green-400 font-bold text-xl">{distPrice}</div>
          </div>
          <div>
            <div className="text-dark-500 text-[10px] uppercase tracking-wider">Retail</div>
            <div className="text-dark-400 text-sm line-through" itemProp="price" content={priceNum.toFixed(2)}>{price}</div>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-2 justify-center md:justify-start">
          <div className="text-white font-bold text-xl" itemProp="price" content={priceNum.toFixed(2)}>{price}</div>
          {compareAt && compareAt !== price && (
            <div className="text-dark-500 text-sm line-through">{compareAt}</div>
          )}
        </div>
      )}
      <div className={`text-xs font-medium mt-1 ${
        out ? 'text-red-400' : low ? 'text-amber-400' : 'text-green-400'
      }`}>
        {isDistributor
          ? (out ? 'Out of Stock' : low ? `${n} left` : `In Stock${s ? ` (${s})` : ''}`)
          : (out ? 'Out of Stock' : low ? `${n} left` : 'In Stock')
        }
      </div>
    </div>
  );
}
