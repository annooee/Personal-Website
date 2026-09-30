# personal website

Personal site built with [Lenis](https://github.com/darkroomengineering/lenis) smooth scroll, a [Vanta.js](https://github.com/tengbao/vanta) FOG background (three.js r134) and Vite. No framework.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

## How it's put together
- `index.html` — all content (edit text here)
- `src/main.js` — Lenis setup, Vanta fog (colours in the `FOG({...})` call), the dot-graph intro, scroll-driven effects
- `src/style.css` — design tokens at the top (`--accent`, fonts, etc.)
- `public/` — static files; drop `resume.pdf` here for the Résumé link

## Intro
Colourful nodes float in as a loose graph over the Vanta fog while the loader counts to 100, then gather into the name.
Cards are frosted glass with a cursor-following light and 3D tilt (`.glass` / `.tilt` in `style.css`).
Scroll scatters them; the cursor repels them. Skip with the button, Enter, Esc or Space.
Respects `prefers-reduced-motion`.

## Publishing (Vercel)
1. Push to GitHub:
   ```bash
   git init && git add . && git commit -m "Initial site"
   gh repo create personal-website --public --source=. --push   # or create the repo on github.com and `git push`
   ```
2. On vercel.com: **Add New → Project → import the repo**. Vite is auto-detected
   (build `npm run build`, output `dist`). Click **Deploy**.
3. Every `git push` to `main` redeploys automatically.
4. Optional: add a custom domain under **Project → Settings → Domains**.

Netlify and Cloudflare Pages work the same way (build `npm run build`, publish `dist`).
