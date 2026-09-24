import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("sélectionne par défaut les refuges de 6 places ou plus", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<input type="number" id="crit-places" min="0" value="6"> ou plus/);
});

test("coche 4 murs et laisse le seuil matelas à zéro par défaut", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<input type="checkbox" id="crit-murs" checked>/);
  assert.match(html, /<input type="number" id="crit-matelas" min="0" value="0"> ou plus/);
});

test("supprime la section AVERTISSEMENT, sans la ligne source ni l'encart de péremption", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<h2>AVERTISSEMENT<\/h2>/);
  assert.doesNotMatch(html, /« Bois » signifie/);
  assert.match(html, /<span id="fetch-time">…<\/span>/);
  assert.match(html, /<p id="stale-warning" hidden>/);
});

test("supprime la ligne de tirets du bandeau", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, / -{10,}$/m);
});

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

const chargerPage = async ({ reponseFetch, vue = () => true, surcharges = {} }) => {
  const ids = [
    "crit-ouvert", "crit-cheminee", "crit-eau", "crit-foret", "crit-places",
    "crit-murs", "crit-matelas", "crit-pins-classiques",
    "criteres", "refuge-count", "fetch-time", "network-error", "api-error",
    "stale-warning", "map", "gpx-file", "gpx-list", "gpx-clear", "gpx-error",
    "export-gpx",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, element(surcharges[id])]));
  elements["crit-pins-classiques"] = element({ checked: false, ...surcharges["crit-pins-classiques"] });
  elements["export-gpx"] = element({ disabled: true, ...surcharges["export-gpx"] });

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
    icon: (options) => ({ __iconeRefugesInfo: true, ...options }),
    Icon: { Default: function IconeParDefaut() { this.__defaut = true; } },
    marker: (coordonnees, options = {}) => {
      const image = {
        ecouteurs: {},
        addEventListener(evenement, rappel) { this.ecouteurs[evenement] = rappel; },
      };
      const marqueur = {
        coordonnees,
        options,
        getElement: () => ({ querySelector: () => image }),
        setIcon(nouvelleIcone) { marqueur.options.icon = nouvelleIcone; },
        bindTooltip() { return marqueur; },
        bindPopup(html) { marqueur.popup = html; return marqueur; },
        addTo(c) { c.addLayer(marqueur); return marqueur; },
      };
      return marqueur;
    },
  };

  const appels = { fetch: [], telechargements: [], blobs: [], revocations: [] };
  const url = {
    createObjectURL(blob) { appels.blobs.push(blob); return "blob:refuges"; },
    revokeObjectURL(lien) { appels.revocations.push(lien); },
  };
  const fetchStub = async (url) => {
    appels.fetch.push(url);
    if (reponseFetch instanceof Error) throw reponseFetch;
    return { ok: true, json: async () => reponseFetch };
  };

  const script = lireScript();
  new Function("document", "window", "L", "fetch", "URL", script)(
    {
      getElementById: (id) => elements[id],
      createElement: () => ({
        click() { appels.telechargements.push({ href: this.href, download: this.download }); },
        remove() {},
      }),
      body: { append() {} },
    },
    { L },
    L,
    fetchStub,
    url,
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
  walls: "complet",
  mattresses: 8,
  icone: "cabane_feu_eau",
  ...surcharge,
});

const snapshot = (refuges, ageJours = 0) => ({
  updatedAt: new Date(Date.now() - ageJours * 864e5).toISOString(),
  refuges,
});

test("exporte les refuges filtrés dans la vue en points GPX compatibles OsmAnd", async () => {
  const { elements, appels } = await chargerPage({
    reponseFetch: snapshot([
      refuge({ id: 1, name: 'Cabane & <test> "été"', url: "https://www.refuges.info/point/1/?a=1&b=2" }),
      refuge({ id: 2, name: "Hors vue", latitude: -33 }),
      refuge({ id: 3, name: "Sans cheminée", chimney: false }),
    ]),
    vue: (lat) => lat > 0,
  });
  assert.equal(elements["export-gpx"].disabled, false);
  elements["export-gpx"].listeners.click();
  assert.deepEqual(appels.telechargements, [{ href: "blob:refuges", download: "refuges.gpx" }]);
  assert.equal(appels.blobs[0].type, "application/gpx+xml");
  assert.equal(await appels.blobs[0].text(), '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="Trouve mon refuge" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '  <wpt lat="42.9" lon="-0.07"><ele>1500</ele><name>Cabane &amp; &lt;test&gt; &quot;été&quot;</name><link href="https://www.refuges.info/point/1/?a=1&amp;b=2"/></wpt>\n' +
    '</gpx>');
  assert.deepEqual(appels.revocations, ["blob:refuges"]);
});

test("désactive l'export sans refuge, après filtrage ou si le snapshot est indisponible", async () => {
  const { elements, appels } = await chargerPage({ reponseFetch: snapshot([refuge()]) });
  assert.equal(elements["export-gpx"].disabled, false);
  elements["crit-cheminee"].checked = false;
  elements["crit-places"].value = "20";
  elements.criteres.listeners.input();
  assert.equal(elements["export-gpx"].disabled, true);
  elements["export-gpx"].listeners.click();
  assert.equal(appels.telechargements.length, 0);

  const indisponible = await chargerPage({ reponseFetch: new Error("hors ligne") });
  assert.equal(indisponible.elements["export-gpx"].disabled, true);
  assert.equal(indisponible.appels.telechargements.length, 0);
});

test("exporte plus de 1000 refuges même lorsque les marqueurs sont masqués", async () => {
  const refuges = Array.from({ length: 1001 }, (_, index) => refuge({ id: index, name: `Cabane ${index}` }));
  const { elements, couche, appels } = await chargerPage({ reponseFetch: snapshot(refuges) });
  assert.equal(couche.couches.length, 0);
  elements["export-gpx"].listeners.click();
  const texte = await appels.blobs[0].text();
  assert.equal((texte.match(/<wpt /g) ?? []).length, 1001);
  assert.match(texte, /<name>Cabane 1000<\/name>/);
});

test("exporte l'état des critères et de la vue au clic, sans altitude inconnue", async () => {
  let vue = true;
  const { elements, carte, appels } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, altitude: null }), refuge({ id: 2, name: "Deux", chimney: false })]),
    vue: () => vue,
  });
  elements["crit-cheminee"].checked = false;
  elements.criteres.listeners.input();
  elements["export-gpx"].listeners.click();
  assert.equal((await appels.blobs[0].text()).match(/<wpt /g).length, 2);
  assert.doesNotMatch(await appels.blobs[0].text(), /<ele>0<\/ele>/);
  vue = false;
  carte.listeners.moveend();
  assert.equal(elements["export-gpx"].disabled, true);
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

test("applique le filtre 4 murs en excluant les murs confirmés manquants", async () => {
  const { elements } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1 }), refuge({ id: 2, walls: "manque un mur" })]),
  });
  assert.equal(elements["refuge-count"].textContent, "1 refuge.");
});

test("inclut les refuges au statut mural inconnu quand 4 murs est coché", async () => {
  const { elements } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, walls: null })]),
  });
  assert.equal(elements["refuge-count"].textContent, "1 refuge.");
});

test("ignore les murs manquants quand 4 murs est décoché", async () => {
  const { elements } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, walls: "manque un mur" })]),
    surcharges: { "crit-murs": { checked: false } },
  });
  assert.equal(elements["refuge-count"].textContent, "1 refuge.");
});

test("applique le filtre places sur matelas", async () => {
  const { elements } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, mattresses: 8 }), refuge({ id: 2, mattresses: 3 })]),
  });
  assert.equal(elements["refuge-count"].textContent, "1 refuge.");
});

test("traite un nombre de matelas inconnu comme zéro", async () => {
  const { elements } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, mattresses: null })]),
  });
  assert.equal(elements["refuge-count"].textContent, "0 refuge — déplacez ou zoomez la carte.");
});

test("affiche matelas et murs dans la popup", async () => {
  const sansFiltre = { "crit-murs": { checked: false }, "crit-matelas": { value: "0" } };
  const { couche } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, mattresses: 2, walls: "manque un mur" })]),
    surcharges: sansFiltre,
  });
  const popup = couche.couches[0].popup;
  assert.match(popup, /<td>Matelas :<\/td><td>2<\/td>/);
  assert.match(popup, /<td>Murs :<\/td><td>manque un mur<\/td>/);

  const { couche: coucheInconnu } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 2, mattresses: null, walls: null })]),
    surcharges: sansFiltre,
  });
  const popupInconnu = coucheInconnu.couches[0].popup;
  assert.match(popupInconnu, /<td>Matelas :<\/td><td>inconnu<\/td>/);
  assert.match(popupInconnu, /<td>Murs :<\/td><td>inconnu<\/td>/);
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

test("affiche chaque refuge avec son icône refuges.info", async () => {
  const { couche } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, icone: "cabane_green_eau" })]),
  });
  const icone = couche.couches[0].options.icon;
  assert.ok(icone.__iconeRefugesInfo);
  assert.equal(icone.iconUrl, "https://www.refuges.info/images/icones/cabane_green_eau.svg");
  assert.deepEqual(icone.iconSize, [24, 24]);
  assert.deepEqual(icone.iconAnchor, [12, 24]);
  assert.deepEqual(icone.tooltipAnchor, [12, -12]);
  assert.deepEqual(icone.popupAnchor, [0, -24]);
});

test("réutilise la même icône pour les refuges de même type", async () => {
  const { couche } = await chargerPage({
    reponseFetch: snapshot([
      refuge({ id: 1, icone: "cabane_feu_eau" }),
      refuge({ id: 2, name: "Cabane 2", icone: "cabane_feu_eau" }),
      refuge({ id: 3, name: "Cabane 3", icone: "cabane_green_eau" }),
    ]),
  });
  assert.equal(couche.couches[0].options.icon, couche.couches[1].options.icon);
  assert.notEqual(couche.couches[0].options.icon, couche.couches[2].options.icon);
});

test("retombe sur le pin par défaut quand l'icône ne charge pas", async () => {
  const { couche, carte } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, icone: "cabane_introuvable" })]),
  });
  const marqueur = couche.couches[0];
  marqueur.getElement().querySelector("img").ecouteurs.error();
  assert.ok(marqueur.options.icon.__defaut, "le marqueur doit repasser sur le pin Leaflet par défaut");

  carte.listeners.moveend();
  const nouveauMarqueur = couche.couches[0];
  assert.equal(nouveauMarqueur.options.icon, undefined, "l'icône en échec ne doit pas être retentée");
});

test("utilise l'icône cabane quand le snapshot n'a pas d'icone", async () => {
  const { couche } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1, icone: undefined })]),
  });
  assert.equal(couche.couches[0].options.icon.iconUrl, "https://www.refuges.info/images/icones/cabane.svg");
});

test("affiche les icônes refuges.info par défaut, sans pins classiques cochés", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<input type="checkbox" id="crit-pins-classiques">/);
});

test("affiche les pins bleus classiques quand la case est cochée", async () => {
  const { couche } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1 })]),
    surcharges: { "crit-pins-classiques": { checked: true } },
  });
  assert.equal(couche.couches[0].options.icon, undefined);
});

test("redessine les marqueurs au changement de la case pins classiques", async () => {
  const { elements, couche } = await chargerPage({
    reponseFetch: snapshot([refuge({ id: 1 })]),
  });
  assert.ok(couche.couches[0].options.icon.__iconeRefugesInfo);

  elements["crit-pins-classiques"].checked = true;
  elements.criteres.listeners.input();
  assert.equal(couche.couches[0].options.icon, undefined);

  elements["crit-pins-classiques"].checked = false;
  elements.criteres.listeners.input();
  assert.ok(couche.couches[0].options.icon.__iconeRefugesInfo);
});
