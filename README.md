# Pulse

AI news hub built on the [midashands](https://github.com/nicgpk/midashands) design system. Aggregates the latest AI news across engineering, design, product management, and breaking news — plus AI YouTube videos.

## Features

- **Dark mode first** — Matches the midashands shadcn/ui-inspired aesthetic
- **Light/dark toggle** — Theme switch using midashands color tokens
- **5 content categories** — Breaking, Engineering, Design, Product, Videos
- **Role-focused tabs** — Engineering (devtools, APIs, coding assistants), Design (AI design tools, Figma AI, generative UI), Product (PM strategy, AI-native products, roadmaps)
- **RSS-powered** — Fetches from dedicated sources per category: Ars Technica, InfoQ, Simon Willison, LangChain, UX Collective, Nielsen Norman, Figma, Lenny's Newsletter, and AI YouTube channels
- **HN fallback** — Falls back to Hacker News Algolia API if RSS is unavailable (no key, no CORS issues)
- **Parallel fetching** — All feeds load simultaneously; total wait = slowest single feed
- **Background prefetch** — All tabs are fetched on mount so switching is instant
- **Infinite scroll** — Articles load as you scroll, no page limits
- **Animated logo** — Pulsing dot logo in header and favicon
- **Responsive** — Works on desktop and mobile

## Design System

All visual tokens come from the midashands design system:

| Token | Dark Value | Light Value |
|-------|-----------|-------------|
| Background | `#0A0A0A` | `#FAFAFA` |
| Foreground | `#FAFAFA` | `#0A0A0A` |
| Primary | `#FAFAFA` | `#171717` |
| Secondary | `#262626` | `#F5F5F5` |
| Border | `#262626` | `#E5E5E5` |
| Border Hover | `#404040` | `#A3A3A3` |
| Focus Ring | `#D4D4D4` | `#171717` |
| Muted Text | `#A1A1AA` | `#737373` |

Spacing uses the midashands 4px baseline scale. Border radius, shadows, and transitions all match the token system.

## Setup

### Prerequisites

You need **Node.js** installed. Check with:

```bash
node --version
```

If not installed, grab the LTS version from [nodejs.org](https://nodejs.org).

### 1. Clone the repository

```bash
git clone https://github.com/nicgpk/ai-pulse.git
cd ai-pulse
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for production

```bash
npm run build
```

Output goes to `dist/` — deploy to Vercel, Netlify, or GitHub Pages.

## Project Structure

```
ai-pulse/
├── public/
│   └── favicon.svg          # Animated browser tab icon
├── src/
│   ├── main.jsx             # Entry point — boots up React
│   ├── App.jsx              # Main component — layout & logic
│   ├── feeds.js             # Data layer — RSS fetching, filtering, HN fallback
│   ├── tokens.css           # midashands design tokens as CSS variables
│   ├── styles.css           # App styles using those tokens
│   └── reset.css            # Browser style reset
├── index.html               # HTML shell
├── package.json             # Dependencies & scripts
└── vite.config.js           # Build tool configuration
```

## Adding New RSS Feeds

Open `src/feeds.js` and add entries to the `RSS_FEEDS` object:

```javascript
engineering: [
  // trusted: true  → entire feed is category-relevant, bypass keyword filter
  // trusted: false → filtered by CATEGORY_KEYWORDS before showing
  { url: "https://example.com/rss/feed.xml", source: "Example", trusted: false },
],
```

For YouTube channels, find the channel ID from the channel URL:

```javascript
{ url: "https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID", source: "Channel Name", trusted: true }
```

## Deploying to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click "New Project" → Import your repo
4. Vercel auto-detects Vite — click "Deploy"
5. Done — you'll get a live URL like `pulse.vercel.app`

## Relationship to midashands

This project consumes design tokens from the midashands system. Token values are replicated in `src/tokens.css`. If you update tokens in midashands, update them here too to stay in sync.

## License

MIT
