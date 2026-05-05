import { useAuth } from './AuthProvider';

interface Props {
  msrp: string;
  dealerPrice: string;
  stock: string;
}

export default function PriceDisplay({ msrp, dealerPrice, stock }: Props) {
  const { isDistributor } = useAuth();

  const stockNum = parseInt(stock);
  const inStock = stock === '20+' || stockNum >= 10;
  const low = stockNum >= 1 && stockNum < 10;
  const contact = stock === 'Contact us';

  return (
    <div>
      {isDistributor ? (
        <div className="flex items-end gap-3 justify-center md:justify-start">
          <div>
            <div className="text-dark-500 text-[10px] uppercase tracking-wider">Dealer</div>
            <div className="text-green-400 font-bold text-xl">
              {dealerPrice && dealerPrice !== '...' ? dealerPrice : 'Call'}
            </div>
          </div>
          <div>
            <div className="text-dark-500 text-[10px] uppercase tracking-wider">MSRP</div>
            <div className="text-dark-400 text-sm line-through">{msrp}</div>
          </div>
        </div>
      ) : (
        <div className="text-white font-bold text-xl">{msrp}</div>
      )}
      <div className={`text-xs font-medium mt-1 ${
        inStock ? 'text-green-400' : low ? 'text-amber-400' : contact ? 'text-dark-400' : 'text-red-400'
      }`}>
        {isDistributor
          ? (inStock ? `In Stock (${stock})` : contact ? 'Contact Us' : `${stock} left`)
          : (inStock ? 'In Stock' : contact ? 'Contact Us' : low ? 'Low Stock' : stock)
        }
      </div>
    </div>
  );
}
