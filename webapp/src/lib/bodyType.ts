// Maps a vehicle (year/make/model) to one of our 7 silhouette slugs.
// Heuristic: pattern-match the model name against keyword lists per body type.
// Falls back to sedan for unrecognised models.

export type BodyType = 'sedan' | 'hatchback' | 'suv' | 'pickup' | 'minivan' | 'coupe' | 'cargo-van';

const PICKUPS = /\b(F-150|F-250|F-350|F-450|F-550|F150|F250|F350|SILVERADO|SIERRA|RAM\s*\d|TACOMA|TUNDRA|COLORADO|CANYON|FRONTIER|TITAN|MAVERICK|RANGER|RIDGELINE|GLADIATOR|HILUX|DAKOTA|RAPTOR|CYBERTRUCK|LIGHTNING)\b/i;
const MINIVANS = /\b(SIENNA|ODYSSEY|PACIFICA|CARNIVAL|GRAND\s*CARAVAN|TOWN\s*&?\s*COUNTRY|ROUTAN|SEDONA|QUEST|VOYAGER|UPLANDER|FREESTAR|VENZA\s*VAN|MAZDA5)\b/i;
const CARGO_VANS = /\b(TRANSIT|SPRINTER|PROMASTER|EXPRESS|SAVANA|NV200|NV1500|NV2500|NV3500|METRIS|CITY\s*EXPRESS)\b/i;
const SUVS = /\b(TUCSON|RAV4|CR-V|CRV|HR-V|HRV|PASSPORT|PILOT|HIGHLAND(ER)?|4RUNNER|SEQUOIA|LAND\s*CRUISER|HARRIER|VENZA|X1|X2|X3|X4|X5|X6|X7|XM|MODEL\s*Y|MODEL\s*X|RX|NX|GX|LX|UX|MDX|RDX|ZDX|MURANO|ROGUE|PATHFINDER|ARMADA|JUKE|KICKS|EQUINOX|TRAILBLAZER|TRAVERSE|SUBURBAN|TAHOE|BLAZER|BRONCO|ESCAPE|EDGE|EXPLORER|EXPEDITION|FLEX|CR-V|SANTA\s*FE|SANTA\s*CRUZ|KONA|PALISADE|VENUE|NEXO|IONIQ\s*5|EV6|TELLURIDE|SORENTO|SPORTAGE|SELTOS|SOUL|NIRO|CX-3|CX-30|CX-5|CX-50|CX-9|CX-90|FORESTER|OUTBACK|ASCENT|CROSSTREK|SOLTERRA|XV|TIGUAN|TAOS|ATLAS|TOUAREG|ID\.4|ID4|Q3|Q5|Q7|Q8|E-TRON|GLA|GLB|GLC|GLE|GLS|G-CLASS|EQB|EQE\s*SUV|EQS\s*SUV|BENTAYGA|CAYENNE|MACAN|TAYCAN\s*SUV|URUS|DBX|F-PACE|E-PACE|I-PACE|DEFENDER|DISCOVERY|RANGE\s*ROVER|XC40|XC60|XC70|XC90|EX30|EX90|GRAND\s*CHEROKEE|CHEROKEE|COMPASS|RENEGADE|WRANGLER|MARINER|TRIBUTE|TRACKER|HHR|UPLAND|TRAX|ENVISION|ENCLAVE|ENCORE|TERRAIN|YUKON|ACADIA|HUMMER\s*EV\s*SUV|GENESIS\s*GV|GV60|GV70|GV80)\b/i;
const HATCHBACKS = /\b(FIT|YARIS\s*HATCH|GOLF|GTI|R32|FIESTA|FOCUS\s*HATCH|MAZDA\s*?3\s*HATCH|MAZDA3\s*HATCH|IMPREZA\s*HATCH|VELOSTER|RIO|FORTE\s*HATCH|MATRIX|VIBE|VERSA\s*NOTE|HATCHBACK|PRIUS\s*C|MIRAGE|HATCH|MINI\s*COOPER|COOPER|MINI|CLUBMAN|MICRA|3-DOOR|5-DOOR|i30|i20|i10|AVEO|SPARK|LEAF|BOLT\s*EV|BOLT|MIRAGE\s*G4|ID\.3|POLO)\b/i;
const COUPES = /\b(MUSTANG|CAMARO|CHALLENGER|CORVETTE|VIPER|GT(\s|$|500)|SHELBY|86|BRZ|FRS|MIATA|MX-5|RX-7|RX-8|370Z|350Z|400Z|Z4|Z3|M2|M3|M4|M6|M8|i8|TT|R8|TTRS|RS5|RS7|911|718|CAYMAN|BOXSTER|TAYCAN\s*COUPE|F-TYPE|GT-R|GTR|SUPRA|GR\s*86|GR\s*SUPRA|GR\s*COROLLA|GR\s*YARIS|NSX|TYPE\s*R|TYPE-R|TYPE\s*S|TYPE-S|S2000|S2K|RX-VISION|AVENTADOR|HURACAN|REVUELTO|VENTADOR|F8|812|812\s*SUPERFAST|SF90|296|ROMA|CALIFORNIA|PORTOFINO|GTC4|MULSANNE|CONTINENTAL\s*GT|FLYING\s*SPUR|DB11|DB12|DBS|VANTAGE|RAPIDE|EVORA|EXIGE|ELISE|EMIRA|EMERA|RC|RC\s*F|GS\s*F|LFA|LC|LC\s*500|IS\s*500|GR\s*COROLLA|CIVIC\s*COUPE|ACCORD\s*COUPE|ECLIPSE\s*COUPE|RC300|RC350|Q60|G37|G35)\b/i;

export function classifyBody(make: string | undefined, model: string | undefined): BodyType {
  if (!model) return 'sedan';
  const m = String(model).toUpperCase().trim();
  // Order matters: more specific first
  if (CARGO_VANS.test(m)) return 'cargo-van';
  if (MINIVANS.test(m)) return 'minivan';
  if (PICKUPS.test(m)) return 'pickup';
  if (SUVS.test(m)) return 'suv';
  if (COUPES.test(m)) return 'coupe';
  if (HATCHBACKS.test(m)) return 'hatchback';
  return 'sedan';
}

// Wheel-overlay positions per body type, as % of image dimensions.
// (left edge of wheel, top edge of wheel, width of wheel) — height = width.
// Tuned by eye against the generated silhouettes. Adjust if any look off.
export const WHEEL_POSITIONS: Record<BodyType, { front: { x: number; y: number; size: number }; rear: { x: number; y: number; size: number } }> = {
  sedan:       { front: { x: 16, y: 50, size: 13 }, rear: { x: 67, y: 50, size: 13 } },
  hatchback:   { front: { x: 16, y: 48, size: 13 }, rear: { x: 68, y: 48, size: 13 } },
  suv:         { front: { x: 17, y: 50, size: 15 }, rear: { x: 67, y: 50, size: 15 } },
  pickup:      { front: { x: 13, y: 52, size: 14 }, rear: { x: 60, y: 52, size: 14 } },
  minivan:     { front: { x: 14, y: 50, size: 14 }, rear: { x: 70, y: 50, size: 14 } },
  coupe:       { front: { x: 13, y: 50, size: 17 }, rear: { x: 67, y: 50, size: 17 } },
  'cargo-van': { front: { x: 11, y: 56, size: 14 }, rear: { x: 73, y: 56, size: 14 } },
};

export function silhouetteSrc(body: BodyType): string {
  return `/images/silhouettes/${body}.jpg`;
}
