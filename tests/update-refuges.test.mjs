import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const SCRIPT = new URL("../docker/update-refuges.sh", import.meta.url).pathname;

const SOURCE_VALIDE = {
  type: "FeatureCollection",
  features: [
    {
      properties: {
        id: 101,
        nom: "Cabane de Couey",
        type: { valeur: "Cabane non gardée", icone: "cabane_feu_eau" },
        places: { valeur: 12 },
        coord: { alt: 1450, lat: 42.9, long: -0.07 },
        lien: "https://www.refuges.info/point/101/",
        etat: { valeur: "" },
        info_comp: {
          cheminee: { valeur: "Oui" },
          eau: { valeur: "Non" },
          bois: { valeur: "Oui" },
          manque_un_mur: { valeur: "Non" },
          places_matelas: { valeur: 2 },
        },
      },
    },
    {
      properties: {
        id: 102,
        nom: "Refuge fermé",
        places: { valeur: null },
        coord: { alt: 2000, lat: 42.8, long: 0.5 },
        etat: { valeur: "Fermée" },
      },
    },
    {
      properties: {
        id: 103,
        nom: "Abri ouvert d'un côté",
        type: { valeur: "Abri" },
        places: { valeur: 6 },
        coord: { alt: 1800, lat: 42.7, long: 0.6 },
        etat: { valeur: "" },
        info_comp: {
          manque_un_mur: { valeur: "Oui" },
          places_matelas: { valeur: "*Inconnu*" },
        },
      },
    },
  ],
};

const preparer = ({ snapshotExistant, source, maxAgeDays = "0" }) => {
  const dossier = mkdtempSync(join(tmpdir(), "refuges-test-"));
  writeFileSync(join(dossier, "source.json"), source);
  if (snapshotExistant !== undefined) {
    writeFileSync(join(dossier, "refuges.json"), snapshotExistant);
  }
  return dossier;
};

const lancer = (dossier, sourceUrl, maxAgeDays = "0") => execFileAsync("sh", [SCRIPT], {
  env: {
    ...process.env,
    REFUGES_API_URL: sourceUrl,
    REFUGES_DATA_DIR: dossier,
    REFUGES_MAX_AGE_DAYS: maxAgeDays,
  },
});

const urlSource = (dossier) => `file://${join(dossier, "source.json")}`;

test("crée le snapshot absent depuis une source valide", async () => {
  const dossier = preparer({
    source: JSON.stringify(SOURCE_VALIDE),
  });
  await lancer(dossier, urlSource(dossier));

  const snapshot = JSON.parse(readFileSync(join(dossier, "refuges.json"), "utf8"));
  assert.ok(!Number.isNaN(Date.parse(snapshot.updatedAt)), "updatedAt doit être une date ISO");
  assert.equal(snapshot.refuges.length, 3);

  const cabane = snapshot.refuges[0];
  assert.equal(cabane.id, 101);
  assert.equal(cabane.name, "Cabane de Couey");
  assert.equal(cabane.type, "Cabane non gardée");
  assert.equal(cabane.capacity, 12);
  assert.equal(cabane.altitude, 1450);
  assert.equal(cabane.latitude, 42.9);
  assert.equal(cabane.longitude, -0.07);
  assert.equal(cabane.url, "https://www.refuges.info/point/101/");
  assert.equal(cabane.closed, "");
  assert.equal(cabane.icone, "cabane_feu_eau");
  assert.equal(cabane.chimney, true);
  assert.equal(cabane.water, false);
  assert.equal(cabane.forest, true);
  assert.equal(cabane.walls, "complet");
  assert.equal(cabane.mattresses, 2);

  const ferme = snapshot.refuges[1];
  assert.equal(ferme.closed, "Fermée");
  assert.equal(ferme.capacity, null);
  assert.equal(ferme.icone, "cabane");
  assert.equal(ferme.chimney, false);
  assert.equal(ferme.walls, null);
  assert.equal(ferme.mattresses, null);

  const abri = snapshot.refuges[2];
  assert.equal(abri.walls, "manque un mur");
  assert.equal(abri.mattresses, null);
  assert.equal(abri.icone, "cabane");

  const restants = readdirSync(dossier).filter((f) => f !== "source.json" && f !== "refuges.json");
  assert.deepEqual(restants, [], "aucun fichier temporaire ne doit rester");
});

test("ne touche pas un snapshot plus récent que l'âge maximal", async () => {
  const marqueur = '{"updatedAt":"' + new Date().toISOString() + '","refuges":[{"sentinel":true}]}';
  const dossier = preparer({ snapshotExistant: marqueur, source: JSON.stringify(SOURCE_VALIDE) });
  await lancer(dossier, urlSource(dossier), "7");

  assert.equal(
    readFileSync(join(dossier, "refuges.json"), "utf8"),
    marqueur,
    "le snapshot récent doit rester intact",
  );
});

test("rafraîchit un snapshot daté dans le futur", async () => {
  const futur = '{"updatedAt":"2099-01-01T00:00:00Z","refuges":[{"sentinel":true}]}';
  const dossier = preparer({ snapshotExistant: futur, source: JSON.stringify(SOURCE_VALIDE) });
  await lancer(dossier, urlSource(dossier), "7");
  const resultat = JSON.parse(readFileSync(join(dossier, "refuges.json"), "utf8"));
  assert.equal(resultat.refuges[0].id, 101);
});

test("garde l'ancien snapshot si la source n'est pas du JSON valide", async () => {
  const ancien = '{"updatedAt":"2000-01-01T00:00:00Z","refuges":[{"ancien":true}]}';
  const dossier = preparer({ snapshotExistant: ancien, source: "<html>pas du json</html>" });
  await assert.rejects(lancer(dossier, urlSource(dossier)));
  assert.equal(readFileSync(join(dossier, "refuges.json"), "utf8"), ancien);
});

test("garde l'ancien snapshot si la source ne contient aucun refuge", async () => {
  const ancien = '{"updatedAt":"2000-01-01T00:00:00Z","refuges":[{"ancien":true}]}';
  const dossier = preparer({
    snapshotExistant: ancien,
    source: JSON.stringify({ type: "FeatureCollection", features: [] }),
  });
  await assert.rejects(lancer(dossier, urlSource(dossier)));
  assert.equal(readFileSync(join(dossier, "refuges.json"), "utf8"), ancien);
});

test("garde l'ancien snapshot si la source est injoignable", async () => {
  const ancien = '{"updatedAt":"2000-01-01T00:00:00Z","refuges":[{"ancien":true}]}';
  const dossier = preparer({ snapshotExistant: ancien, source: JSON.stringify(SOURCE_VALIDE) });
  await assert.rejects(lancer(dossier, "file:///inexistant.json"));
  assert.equal(readFileSync(join(dossier, "refuges.json"), "utf8"), ancien);
});
