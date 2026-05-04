# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-04

## User Preferences

- James (the user/admin) is not the site owner — "james" (the owner) provides credentials and business decisions
- Prefers lightweight webapp, no heavy CMS (rejected WordPress/WooCommerce approach)
- Wants AI-like intelligent search, not tree-based dropdowns
- Key feature: wheel visualizer — customers see how wheels fit on their car
- Don't expose cross-vehicle fitment data to customers — that's competitive info. Product pages should NOT show "fits these other vehicles"

## Key Learnings

- **Project:** gtatire
- **Supplier portals are Canadian-region restricted** — Alltire works (maybe our IP is fine), but RWC (gpibtob.com) times out and may need a Canadian VPN/proxy to access
- **Alltire portal is classic ASP** — tab-based UI, Year/Make/Model dropdowns for wheels and fitment, text search for tires. Data loads dynamically via JS, no REST API
- **Superspeed B2B is an Angular SPA** — hash routing (#/login), needs SPA-aware scraping with wait times
- **Superspeed password (1308) is wrong** — waiting for correct credentials from James (site owner)
- **Alltire search fields:** Quick Size (compact format e.g. 2257516), Product No., Description, Maker, Model, Full Size (e.g. LT225/75R16)
- **Alltire wheel search:** Year → Make → Model → Diameter → Steel/Alloy/All + Hub Centric filter

## Do-Not-Repeat

- [2026-05-04] Alltire wheel search requires Year → Make → Model → **Diameter** selection before products load. Without diameter, the product table stays empty. Always iterate through each diameter for every model.
- [2026-05-04] The Alltire wheel products load as regular HTML `<tr>` rows (not Tabulator widgets). Product rows have 12+ `<td>` cells where cell[0] is a row number (digit).
- [2026-05-04] Don't use relative paths like `../data` in Node scripts run from different CWDs. Use `path.join(__dirname, '..', 'data')` instead.

## Decision Log

- [2026-05-04] **Tech stack: Astro + React + Tailwind v4** — chosen for lightweight static output, React islands for interactive components (search, visualizer), Tailwind for mobile-first blue/black theme. Rejected WordPress/WooCommerce (too heavy, existing site already uses it).
- [2026-05-04] **Scrape 2020-present only** — user decided older vehicles aren't needed, cuts scraping time by 75%.
- [2026-05-04] **Supabase for auth/DB** — free tier sufficient, handles distributor login, wholesale pricing tiers.
- [2026-05-04] **Dual search: classic Year/Make/Model + smart text search** — users expect the classic dropdown flow but also want intelligent search as a differentiator.
