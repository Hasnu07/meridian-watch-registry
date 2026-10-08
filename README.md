# meridian-watch-registry

Client profile & watch management system (Node + Express + SQLite).

## Run

```bash
npm install
npm start          # or: npm run dev  (restarts on server changes)
```

## Front-end build

The browser files in `public/js/` and `public/css/app.css` are **generated** and
committed, so the server runs without a build step. Edit the sources, then rebuild:

| Edit this | Builds into |
|---|---|
| `src/dashboard/*.js` (dashboard logic, one file per area) | `public/js/dashboard.js` |
| `src/patek-desk/app.jsx` (Patek Desk) | `public/js/patek-desk.js` |
| Tailwind classes in `public/*.html` / `src/dashboard`, or `tailwind.config.js` | `public/css/app.css` |

```bash
npm run build         # one-off build
npm run build:watch   # rebuild on every save while you work
```

The build also stamps `?v=<hash>` on those assets in the HTML pages so browsers
load the new version straight away. Hand-written theme styles live in
`public/style.css`.
