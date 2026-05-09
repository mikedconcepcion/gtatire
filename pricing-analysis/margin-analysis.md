# GTA Tire Distributor -- Brand Margin Analysis

> Generated: 2026-05-06 | Data source: 4,748 tires from Alltire catalog
> Pricing model: Public = MSRP x 0.90 | Distributor = DC x 1.20 (fallback: MSRP x 0.60) | Compare-at = MSRP

## Important Notes on Data

- **Dealer Cost (DC) is hidden** by Alltire for most SKUs (shown as "DC", "...", "Liquid.", "Special")
- Where DC is unknown, distributor price defaults to MSRP x 0.60 (40% off MSRP)
- Actual dealer cost is likely 40-55% of MSRP for premium brands, 35-50% for budget brands
- Industry standard: tire retailers earn 20-30% gross margin; tire shops 25-50%
- MAP policies restrict **advertised** prices, not necessarily the price you sell at in-store

---

## Tier 1: Premium Brands (MAP-Restricted, Lower Margins)

These brands have MAP (Minimum Advertised Price) policies. You cannot advertise below their minimum price online. Margins are tighter but brand reputation drives traffic.

| Brand | SKUs | Avg MSRP | Avg Public | Avg Dist | Est. DC Range | Est. Margin (Retail) | MAP Restricted | Notes |
|-------|------|----------|------------|----------|---------------|---------------------|----------------|-------|
| **MICHELIN** | 526 | $404.99 | $364.49 | $291.59 | $220-260 | 5-10% | **YES - Strict** | User confirms only ~5% markup allowed. MAP is aggressively enforced. Profit per tire: $15-35 |
| **BRIDGESTONE** | 200 | $654.18 | $588.76 | $471.01 | $350-420 | 8-12% | **YES** | Highest MSRP avg. MAP enforced. Sub-brand Firestone has more flexibility. Profit per tire: $40-70 |
| **CONTINENTAL** | 255 | $485.79 | $437.21 | $349.77 | $260-310 | 8-12% | **YES** | Strong in all-season (209 SKUs). MAP documented via Excel spreadsheets to dealers. Profit per tire: $30-50 |
| **PIRELLI** | 198 | $728.38 | $655.54 | $524.43 | $390-470 | 8-12% | **YES** | Highest avg MSRP of all brands. Luxury/performance segment. Profit per tire: $50-80 |
| **GOODYEAR** | 164 | $593.97 | $534.57 | $427.66 | $320-380 | 8-12% | **YES** | Strong brand recognition. MAP enforced. Profit per tire: $40-60 |
| **NOKIAN** | 115 | $516.36 | $464.72 | $371.78 | $280-330 | 10-15% | Moderate | Finnish brand, strong winter reputation in Canada. Slightly more margin flexibility. Profit per tire: $35-55 |

### Premium Brand Summary
- **Total SKUs:** 1,458 (30.7% of catalog)
- **Avg MSRP:** $530+ per tire
- **Realistic margin per tire:** $25-70
- **MAP enforcement:** All use 3-strike system (warning, penalty, blacklist)
- **Volume:** High demand, sells itself on brand name
- **Verdict:** Low margin per unit, but reliable volume. Necessary for credibility.

---

## Tier 2: Mid-Tier Brands (Moderate MAP, Better Margins)

These brands have some MAP policies but enforcement is generally less strict. Better margin opportunity while still offering recognized quality.

| Brand | SKUs | Avg MSRP | Avg Public | Avg Dist | Est. DC Range | Est. Margin (Retail) | MAP Restricted | Notes |
|-------|------|----------|------------|----------|---------------|---------------------|----------------|-------|
| **HANKOOK** | 714 | $343.89 | $309.50 | $247.60 | $175-220 | 15-20% | **YES** | Largest SKU count. Sub-brand LAUFENN is budget alternative. Profit per tire: $30-50 |
| **KUMHO** | 515 | $247.57 | $222.81 | $178.25 | $125-160 | 15-22% | Moderate | Strong value brand. Lower MSRP = accessible price point. Profit per tire: $25-40 |
| **YOKOHAMA** | 243 | $385.82 | $347.24 | $277.79 | $210-250 | 12-18% | **YES** | Performance-oriented. MAP exists but less aggressive. Profit per tire: $30-50 |
| **NEXEN** | 184 | $308.80 | $277.92 | $222.33 | $165-200 | 15-22% | Moderate | Korean brand, growing market share. Good margin flexibility. Profit per tire: $25-45 |
| **LAUFENN** | 263 | $213.44 | $192.10 | $153.68 | $110-140 | 18-25% | Light | Hankook's budget sub-brand. Less MAP restriction. Profit per tire: $25-40 |
| **BFGOODRICH** | 95 | $372.34 | $335.10 | $268.08 | $200-240 | 12-18% | Moderate | Michelin-owned but positioned mid-tier. Off-road/LT strong. Profit per tire: $30-45 |
| **FIRESTONE** | 96 | $438.07 | $394.27 | $315.41 | $235-280 | 12-18% | Moderate | Bridgestone sub-brand. More pricing flexibility than parent. Profit per tire: $30-50 |
| **TOYO** | 34 | $400.21 | $360.19 | $288.15 | $215-260 | 15-20% | Moderate | Niche but loyal following. Good truck/SUV margins. Profit per tire: $30-50 |
| **FALKEN** | 16 | $338.94 | $305.04 | $244.03 | $180-220 | 15-22% | Light | Sumitomo-owned. Performance segment. Small catalog but good margins. Profit per tire: $25-45 |
| **UNIROYAL** | 69 | $207.28 | $186.55 | $149.24 | $105-135 | 18-25% | Light | Michelin-owned budget brand. Good entry-level margins. Profit per tire: $20-35 |
| **GENERAL** | 23 | $358.13 | $322.32 | $257.85 | $190-230 | 15-20% | Moderate | Continental sub-brand. Fewer SKUs but solid margins. Profit per tire: $25-40 |
| **COOPER** | 15 | $413.90 | $372.51 | $298.00 | $225-270 | 15-20% | Moderate | Now Goodyear-owned. Strong truck/SUV. Profit per tire: $30-50 |

### Mid-Tier Summary
- **Total SKUs:** 2,266 (47.7% of catalog)
- **Avg MSRP:** $300-400 per tire
- **Realistic margin per tire:** $25-50
- **MAP enforcement:** Variable, generally less strict
- **Volume:** Good -- value-conscious customers, fleet buyers
- **Verdict:** Best balance of margin and volume. This is where the money is made consistently.

---

## Tier 3: Budget Brands (No MAP, Highest Margins)

No MAP restrictions. You set the price. These brands have the widest spread between dealer cost and what the market will bear. The real margin opportunity.

| Brand | SKUs | Avg MSRP | Avg Public | Avg Dist | Est. DC Range | Est. Margin (Retail) | MAP Restricted | Notes |
|-------|------|----------|------------|----------|---------------|---------------------|----------------|-------|
| **SAILUN** | 361 | $283.83 | $255.45 | $204.36 | $130-170 | 25-35% | **No** | Largest budget brand. PTPA-certified. Good quality for price. Profit per tire: $40-70 |
| **ILINK** | 299 | $144.01 | $129.61 | $103.68 | $55-80 | 30-40% | **No** | Cheapest brand. High volume winter tires. Profit per tire: $25-45 |
| **MIRAGE** | 185 | $206.77 | $186.09 | $148.87 | $95-125 | 28-38% | **No** | Chinese brand, ZC Rubber group. Profit per tire: $35-55 |
| **TRANSMATE** | 54 | $174.81 | $157.33 | $125.87 | $80-110 | 28-35% | **No** | All-season only. Profit per tire: $25-40 |
| **TRIANGLE** | 30 | $233.83 | $210.45 | $168.36 | $110-145 | 25-35% | **No** | Chinese brand, improving quality. Profit per tire: $30-50 |
| **OVATION** | 15 | $261.93 | $235.74 | $188.59 | $120-160 | 28-35% | **No** | Small catalog. Profit per tire: $30-50 |
| **IRONMAN** | 11 | $213.09 | $191.78 | $153.43 | $100-135 | 28-38% | **No** | Hercules sub-brand, budget segment. Profit per tire: $30-45 |
| **WESTLAKE** | 11 | $200.04 | $180.03 | $144.03 | $95-125 | 28-38% | **No** | ZC Rubber (China's largest). Known brand in budget space. Profit per tire: $30-50 |
| **SURETRAC** | 13 | $197.69 | $177.92 | $142.34 | $90-120 | 28-35% | **No** | All-season only. Profit per tire: $25-40 |
| **CARLISLE** | 11 | $187.11 | $168.40 | $134.72 | $85-115 | 25-32% | **No** | Specialty/trailer tires. Profit per tire: $25-35 |

### Budget Brand Summary
- **Total SKUs:** 1,024 (21.6% of catalog)
- **Avg MSRP:** $150-280 per tire
- **Realistic margin per tire:** $25-70
- **MAP enforcement:** None
- **Volume:** Growing fast -- price-sensitive GTA market, especially winter tires
- **Verdict:** Highest margin percentage. Sailun and ILINK are the volume leaders. Push these hard.

---

## Revenue Comparison: Which Tier Makes the Most Money?

### Per-Tire Profit (Estimated)

| Tier | Avg Sell Price | Est. Cost | Est. Profit/Tire | Margin % |
|------|---------------|-----------|-----------------|----------|
| Premium (Michelin, Bridgestone, etc.) | $450-600 | $350-480 | $30-60 | 8-12% |
| Mid-Tier (Hankook, Kumho, Yokohama) | $250-380 | $150-270 | $30-50 | 15-22% |
| Budget (Sailun, ILINK, Mirage) | $130-260 | $70-160 | $35-65 | 25-38% |

### Per Set of 4

| Tier | Revenue (4 tires) | Cost (4 tires) | Gross Profit | Margin % |
|------|-------------------|----------------|-------------|----------|
| Premium | $1,800-2,400 | $1,400-1,920 | $120-240 | 8-12% |
| Mid-Tier | $1,000-1,520 | $600-1,080 | $120-200 | 15-22% |
| Budget | $520-1,040 | $280-640 | $140-260 | 25-38% |

### Key Insight
**Budget tires can make MORE gross profit per set than premium tires** because the margin percentage is 2-3x higher, even though the dollar amount per tire is similar. A set of 4 Sailun tires at 30% margin earns more than a set of 4 Michelin tires at 5% margin.

---

## Seasonal Analysis

| Season | Total SKUs | Avg MSRP | Key Brands | Margin Notes |
|--------|-----------|----------|------------|-------------|
| All Season | 2,527 | $340 | Hankook (445), Michelin (338), Kumho (245) | Standard margins apply |
| Winter | 1,147 | $310 | ILINK (198), Hankook (197), Kumho (171) | **Higher demand Oct-Dec, premium pricing accepted** |
| All Weather | 1,074 | $360 | Kumho (99), Laufenn (74), Nokian (74) | Growing category, customers pay more for convenience |

### Winter Tire Margin Opportunity
- Winter tires command urgency pricing (customers need them NOW in October-November)
- Budget winter tires (ILINK, Sailun, Mirage) have the best margins AND highest urgency demand
- ILINK has 198 winter SKUs at avg $144 MSRP -- lowest price point, highest margin percentage
- Consider seasonal markup: 5-10% higher pricing Sept-Nov when demand peaks

---

## Data Limitations

1. **Dealer Cost is hidden** -- Alltire masks DC for most products. Margins are estimated based on industry standards.
2. **Flat pricing applied** -- Current GTA pricing uses flat 10% off MSRP (public) and 28% off MSRP (distributor) across ALL brands, which does not optimize for brand-specific margins.
3. **No MAP enforcement tracking** -- We don't know which specific SKUs have MAP restrictions.
4. **Competitor pricing not available** -- Would need to scrape SimplTire, Canadian Tire, Costco for comparison.
