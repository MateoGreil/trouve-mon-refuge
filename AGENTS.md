# trouve-mon-refuge

Static single-page site mapping unstaffed mountain shelters in the Pyrénées,
using a compact refuges.info snapshot refreshed by a dedicated updater. Live at
<https://trouve-mon-refuge.liberateur.fr>.

## Working on this repo

- Frontend code lives in `index.html`: plain HTML with inline JavaScript and
  Leaflet loaded from a CDN. There is no framework or frontend build step.
- Run locally: `docker compose up --build -d`, then open
  <http://localhost:8080>.
- Run tests: `node --test tests/*.test.mjs`.
- Keep the HTML very basic: no unnecessary CSS.
