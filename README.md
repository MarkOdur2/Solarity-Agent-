# Solarity Africa - Solar Origination Agent

AI-powered pipeline for discovering, qualifying, and enriching C&I solar prospects across Sub-Saharan Africa.

## What it does

1. **Discovery** - Gemini 2.0 Flash with Google Search grounding finds real companies matching your criteria
2. **Qualification** - Claude Sonnet scores each prospect across 6 solar-specific criteria (load, grid, currency, credit, diesel, access)
3. **Enrichment** - Claude with web search finds decision-maker contacts (MD/CEO, Operations Manager) for Hot and Warm prospects

## Quick Start

```bash
# Clone and install
git clone <your-repo-url>
cd solarity-agent
npm install

# Run locally
npm run dev
```

Open http://localhost:3000 and enter your API keys.

## API Keys Required

- **Gemini API Key** - Get free at https://aistudio.google.com/apikey
- **Anthropic API Key** - Get at https://console.anthropic.com/settings/keys

Keys are used client-side only and never leave your browser.

## Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repo to Vercel at https://vercel.com/new for automatic deploys on push.

## Deploy to Netlify

```bash
# Build
npm run build

# Deploy the dist/ folder
npx netlify-cli deploy --prod --dir=dist
```

Or drag and drop the `dist/` folder at https://app.netlify.com/drop

## Project Structure

```
solarity-agent/
  index.html          # Entry HTML
  vite.config.js      # Vite configuration
  package.json        # Dependencies
  src/
    main.jsx          # React entry point
    App.jsx           # Full application (single file)
```

## CORS Note

The Anthropic API call uses the `anthropic-dangerous-direct-browser-access` header which enables direct browser-to-API calls. This is fine for personal/internal tools. For a production deployment shared with others, consider adding a thin backend proxy (Express/FastAPI) that holds your Anthropic key server-side.

## Tech Stack

- React 18 + Vite
- Gemini 2.0 Flash API (discovery with Google Search grounding)
- Claude Sonnet API (qualification + enrichment with web search)
- Zero external UI libraries (custom dark theme)
