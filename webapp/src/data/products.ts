// Product types and data loading from static JSON files

export interface Product {
  id: string;
  productNo: string;
  supplier: string;
  category: 'wheel' | 'tire';
  brand: string;
  wheelType: string;
  name: string;
  description: string;
  image: string;
  images?: string[];
  price: string;
  priceNum: number;
  distPrice: string;
  distPriceNum: number;
  compareAt: string;
  compareAtNum: number;
  stock: string;
  hubCentric: boolean;
  rimDiameter: number | null;
  rimWidth: number | null;
  boltPattern: string;
  offset: number | null;
  hubBore: number | null;
  finish: string;
  seat?: string;
  tpmsCompatible?: string;
  runflatCertified?: string;
  loadRating?: string;
  tireSize?: string;
  tireWidth?: number | null;
  tireAspect?: number | null;
}

export interface VehicleTree {
  [year: string]: {
    [make: string]: {
      [model: string]: string[];
    };
  };
}

export interface FitmentMap {
  [productNo: string]: string[]; // "year|make|model"
}

export interface CatalogStats {
  totalProducts: number;
  totalFitments: number;
  years: number;
  makes: number;
  models: number;
  byType: Record<string, number>;
  byDiameter: Record<string, number>;
  priceRange: { min: number; max: number };
  lastUpdated: string;
}

// Load static JSON at build time (Astro)
export async function loadProducts(): Promise<Product[]> {
  const res = await fetch('/data/products.json');
  return res.json();
}

export async function loadVehicles(): Promise<VehicleTree> {
  const res = await fetch('/data/vehicles.json');
  return res.json();
}

export async function loadFitment(): Promise<FitmentMap> {
  const res = await fetch('/data/fitment.json');
  return res.json();
}

export async function loadStats(): Promise<CatalogStats> {
  const res = await fetch('/data/stats.json');
  return res.json();
}

// Helper: get products that fit a specific vehicle
export function getProductsForVehicle(
  products: Product[],
  fitment: FitmentMap,
  year: string,
  make: string,
  model: string
): Product[] {
  const vehicleKey = `${year}|${make}|${model}`;
  const matchingProductNos = new Set<string>();

  for (const [productNo, vehicles] of Object.entries(fitment)) {
    if (vehicles.includes(vehicleKey)) {
      matchingProductNos.add(productNo);
    }
  }

  return products.filter(p => matchingProductNos.has(p.productNo));
}
