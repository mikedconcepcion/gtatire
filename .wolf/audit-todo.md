# Audit TODO — from ChatGPT review of jsdcwheels.ca (2026-05-15)

Logged for follow-up after the SSR refactor lands. Items grouped by priority.

## P0 — Legal / risk (needs James's input)

Items I can implement but need real values for:

- [ ] Footer business info
  - Legal entity name (`JSDC Wheels Inc.`? sole prop?)
  - Ontario corporation #
  - HST #
- [ ] Physical address (currently only "Scarborough, ON" in schema)
- [ ] Phone number
- [ ] Business hours
- [ ] Return / refund / cancellation policy text
  - Default template suggested: final-sale on mounted tires, 14-day unmounted return,
    special-order non-returnable, installer liability disclaimer
- [ ] Installation / fitment liability disclaimer (text)
- [ ] "10% off MSRP" claim review — Canadian Competition Bureau rules require
  substantiated MSRP. Either prove MSRP basis or soften phrasing to
  "competitive pricing below typical retail."

## P0 — Legal / risk (can do alone)

- [ ] About page with company narrative (draft, James edits)
- [ ] Installation liability disclaimer (placeholder text)
- [ ] "Last updated" timestamps on policy pages
- [ ] AODA accessibility verification (Lighthouse, axe DevTools, WAVE)

## P1 — SEO content (can do alone)

- [ ] City landing pages
  - /toronto-wheels
  - /scarborough-tires
  - /mississauga-winter-tires
  - /markham-wheel-packages
  - /brampton-all-weather-tires
  - Each: localized inventory, delivery info, seasonal guidance, local schema
- [ ] Educational guides under /guides/
  - Winter Tire Law Ontario
  - Best Tires for Tesla Model 3 Canada
  - Alloy vs Steel Wheels in Snow
  - Hub Centric vs Lug Centric
  - Best Tire Brands for GTA Winters
  - TPMS Explained Canada
  - Bolt Pattern Guide
  - Offset Guide
- [ ] Thin brand pages: unique descriptions, fitment explanations, inventory
  categories, internal linking
- [ ] FAQ section sitewide

## P1 — Schema markup (can do alone)

- [x] AutoPartsStore schema (already in Layout)
- [ ] LocalBusiness schema with `areaServed: "Greater Toronto Area"`
- [ ] Product schema on /wheels/[id] and /tires/[id]
- [ ] FAQ schema on relevant pages
- [ ] Breadcrumb schema
- [ ] AggregateRating schema (when reviews exist)
- [ ] Offer schema on product pages

## P2 — GEO / AEO entity signals (can do alone)

- [ ] Author / founder signals — short bio of James / company background
- [ ] Years in business
- [ ] Certifications (if any)
- [ ] Warehouse photos
- [ ] Installer partnerships listing

## P2 — External (James does)

- [ ] Google Business Profile
- [ ] Bing Places
- [ ] Apple Business Connect
- [ ] Reddit / GTA forum mentions
- [ ] Local automotive backlinks
- [ ] YouTube shorts / reels (fitment explainers)
- [ ] Reviews integration (Google Reviews embed)

## Current audit scores (per ChatGPT)

| Area | Score |
|---|---|
| Technical SEO | 7.5/10 |
| Content SEO | 6.5/10 |
| Local SEO | 4/10 |
| GEO/AEO readiness | 8/10 |
| Trust/EEAT | 4.5/10 |
| Legal/compliance | 5.5/10 |

Biggest opportunity per audit: long-tail GTA fitment SEO via entity-rich,
location-rich, guide-rich content.
