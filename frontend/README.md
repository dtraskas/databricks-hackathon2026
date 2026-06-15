# Healthcare Data Quality Studio

A Streamlit-style web app for non-technical users (NGO planners, healthcare analysts) to assess and improve the quality of a messy dataset of healthcare facilities in India.

## Stack
- React 18 + Vite 5 + TypeScript
- Tailwind CSS v3 + shadcn/ui components
- recharts, lucide-react
- All data is mocked client-side; reviews persist in `localStorage`

## Run locally
```bash
npm install        # or pnpm / bun / yarn
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
npm run preview
```

## Project layout
```
src/
  App.tsx                  # full app UI (6 views)
  main.tsx                 # entry
  index.css                # Tailwind + design tokens
  lib/
    facilities-data.ts     # mock dataset + scoring/extraction
    review-store.ts        # localStorage-backed review hook
    utils.ts               # cn() helper
  components/ui/           # shadcn primitives (button, card, ...)
```
