# trouve-mon-refuge

Static single-page site mapping unstaffed mountain shelters in the Pyrénées,
from a refuges.info data snapshot embedded in the page. Live at
<https://trouve-mon-refuge.liberateur.fr>.

## Working on this repo

- All code lives in `index.html` — plain HTML with inline JavaScript, Leaflet
  loaded from a CDN. No framework, no build step, no test suite.
- Run locally: `docker build -t trouve-mon-refuge .` then
  `docker run --rm -p 8080:80 trouve-mon-refuge`, and open
  <http://localhost:8080>.
- Keep the HTML very basic: no unnecessary CSS.
