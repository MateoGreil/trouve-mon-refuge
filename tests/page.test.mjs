import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("déclare un favicon SVG local", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);

  const favicon = readFileSync(new URL("../favicon.svg", import.meta.url), "utf8");
  assert.match(favicon, /^<svg[\s\S]*<\/svg>\n?$/);

  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /^COPY favicon\.svg \/usr\/share\/nginx\/html\/favicon\.svg$/m);
});

const lireScript = () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const extrait = html.match(/<script>\n([\s\S]*)\n  <\/script>/);
  assert.ok(extrait, "script inline introuvable dans index.html");
  return extrait[1];
};

const element = (surcharge = {}) => ({
  checked: true,
  value: "8",
  hidden: true,
  textContent: "",
  disabled: false,
  listeners: {},
  addEventListener(evenement, rappel) {
    this.listeners[evenement] = rappel;
  },
  ...surcharge,
});

const chargerPage = async ({ reponseFetch, vue = () => true }) => {
  const ids = [
    "crit-ouvert", "crit-cheminee", "crit-eau", "crit-foret", "crit-places",
    "criteres", "refuge-count", "fetch-time", "network-error", "api-error",
    "stale-warning", "map",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));

  const couche = {
    couches: [],
    clearLayers() { this.couches = []; },
    addLayer(marqueur) { this.couches.push(marqueur); },
    addTo() { return this; },
  };
  const carte = {
    setView() { return this; },
    getBounds() { return { contains: ([lat, lon]) => vue(lat, lon) }; },
    listeners: {},
    on(evenement, rappel) { this.listeners[evenement] = rappel; },
  };
  const L = {
    map: () => carte,
    tileLayer: () => ({ on() {}, addTo() {} }),
    layerGroup: () => couche,
    marker: (coordonnees) => {
      const marqueur = {
        coordonnees,
        bindTooltip() { return marqueur; },
        bindPopup() { return marqueur; },
        addTo(c) { c.addLayer(marqueur); return marqueur; },
      };
      return marqueur;
    },
  };

  const appels = { fetch: [] };
  const fetchStub = async (url) => {
    appels.fetch.push(url);
    if (reponseFetch instanceof Error) throw reponseFetch;
    return { ok: true, json: async () => reponseFetch };
  };

  const script = lireScript();
  new Function("document", "window", "L", "fetch", script)(
    { getElementById: (id) => elements[id] },
    { L },
    L,
    fetchStub,
  );
  await new Promise((r) => setTimeout(r, 10));

  return { elements, carte, couche, appels };
};

const refuge = (surcharge = {}) => ({
  id: 1,
  name: "Cabane de test",
  type: "Cabane non gardée",
  capacity: 8,
  altitude: 1500,
  latitude: 42.9,
  longitude: -0.07,
  url: "https://www.refuges.info/point/1/",
  closed: "",
  chimney: true,
  water: true,
  forest: true,
  ...surcharge,
});

const snapshot = (refuges, ageJours = 0) => ({
  updatedAt: new Date(Date.now() - ageJours * 864e5).toISOString(),
  refuges,
});

test("récupère le snapshot local /data/refuges.json", async () => {
  const { appels } = await chargerPage({ reponseFetch: snapshot([refuge()]) });
  assert.deepEqual(appels.fetch, ["/data/refuges.json"]);
});

test("compte les refuges visibles et conformes aux critères", async () => {
  const { elements, couche } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1 }), refuge({ id: 2, name: "Cabane 2" })]),
  });
  assert.equal(elements["refuge-count"].textContent, "2 refuges.");
  assert.equal(couche.couches.length, 2);
});

test("exclut un refuge hors de la vue", async () => {
  const { elements, carte } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, latitude: 42.9 }), refuge({ id: 2, latitude: -33 })]),
    vue: (lat) => lat > 0,
  });
  assert.equal(elements["refuge-count"].textContent, "1 refuge.");
  assert.equal(carte.listeners.moveend.name, "maj");
});

test("applique le filtre cheminée au format compact", async () => {
  const { elements } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, chimney: true }), refuge({ id: 2, chimney: false })]),
  });
  assert.equal(elements["refuge-count"].textContent, "1 refuge.");
});

test("applique le filtre refuge fermé au format compact", async () => {
  const { elements } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, closed: "" }), refuge({ id: 2, closed: "Fermée" })]),
  });
  assert.equal(elements["refuge-count"].textContent, "1 refuge.");
});

test("applique le filtre places sur capacity", async () => {
  const { elements } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, capacity: 8 }), refuge({ id: 2, capacity: 4 })]),
  });
  assert.equal(elements["refuge-count"].textContent, "1 refuge.");
});

test("affiche la date du snapshot, sans avertissement si récent", async () => {
  const { elements } = await chargerPage({ reponseFetch: snapshot([refuge()], 1) });
  assert.ok(elements["fetch-time"].textContent.length > 0);
  assert.notEqual(elements["fetch-time"].textContent, "…");
  assert.equal(elements["stale-warning"].hidden, true);
});

test("affiche l'avertissement de données périmées après 14 jours", async () => {
  const { elements } = await chargerPage({ reponseFetch: snapshot([refuge()], 15) });
  assert.equal(elements["stale-warning"].hidden, false);
});

test("affiche l'erreur API si le snapshot est indisponible", async () => {
  const { elements } = await chargerPage({ reponseFetch: new Error("indisponible") });
  assert.equal(elements["api-error"].hidden, false);
  assert.equal(elements.criteres.disabled, true);
});
