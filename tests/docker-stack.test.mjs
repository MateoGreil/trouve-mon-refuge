import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const RACINE = new URL("..", import.meta.url).pathname;
const ENTRYPOINT = join(RACINE, "docker/updater-entrypoint.sh");
const HEALTHCHECK = join(RACINE, "docker/check-snapshot.sh");

const executable = (chemin, contenu) => {
  writeFileSync(chemin, contenu);
  chmodSync(chemin, 0o755);
};

const environnement = ({ resultat = "success", snapshot } = {}) => {
  const dossier = mkdtempSync(join(tmpdir(), "refuges-stack-"));
  const data = join(dossier, "data");
  const bin = join(dossier, "bin");
  mkdirSync(data);
  mkdirSync(bin);
  if (snapshot) writeFileSync(join(data, "refuges.json"), snapshot);
  executable(join(bin, "update-refuges"), `#!/bin/sh
if [ "$UPDATE_RESULT" = success ]; then
  printf '{"updatedAt":"2099-01-01T00:00:00Z","refuges":[{}]}' > "$REFUGES_DATA_DIR/refuges.json"
  exit 0
fi
exit 1
`);
  executable(join(bin, "supercronic"), `#!/bin/sh
printf '%s' "$*" > "$SUPERCRONIC_CALL"
`);
  return {
    dossier,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      REFUGES_DATA_DIR: data,
      UPDATE_RESULT: resultat,
      SUPERCRONIC_CALL: join(dossier, "supercronic-call"),
    },
  };
};

const snapshot = (ageJours) => JSON.stringify({
  updatedAt: new Date(Date.now() - ageJours * 864e5).toISOString(),
  refuges: [{}],
});

test("le cron vérifie le snapshot chaque jour à 04:20 UTC", () => {
  assert.equal(
    readFileSync(join(RACINE, "docker/refuges.crontab"), "utf8"),
    "20 4 * * * /usr/local/bin/update-refuges\n",
  );
});

test("l'updater refuse de démarrer sans premier snapshot", async () => {
  const { dossier, env } = environnement({ resultat: "failure" });
  await assert.rejects(execFileAsync("sh", [ENTRYPOINT], { env }), (erreur) => erreur.code === 1);
  assert.equal(existsSync(join(dossier, "supercronic-call")), false);
});

test("l'updater lance Supercronic après la première récupération", async () => {
  const { dossier, env } = environnement();
  await execFileAsync("sh", [ENTRYPOINT], { env });
  assert.equal(readFileSync(join(dossier, "supercronic-call"), "utf8"), "/etc/refuges.crontab");
});

test("l'updater conserve un snapshot valide si la mise à jour échoue", async () => {
  const { dossier, env } = environnement({ resultat: "failure", snapshot: snapshot(8) });
  await execFileAsync("sh", [ENTRYPOINT], { env });
  assert.equal(readFileSync(join(dossier, "supercronic-call"), "utf8"), "/etc/refuges.crontab");
});

test("le healthcheck accepte un snapshot récent", async () => {
  const { env } = environnement({ snapshot: snapshot(1) });
  await execFileAsync("sh", [HEALTHCHECK], { env });
});

test("le healthcheck refuse un snapshot absent, futur ou vieux de 14 jours", async () => {
  const absent = environnement();
  await assert.rejects(execFileAsync("sh", [HEALTHCHECK], { env: absent.env }), (erreur) => erreur.code === 2);
  for (const age of [-1, 15]) {
    const invalide = environnement({ snapshot: snapshot(age) });
    await assert.rejects(execFileAsync("sh", [HEALTHCHECK], { env: invalide.env }), (erreur) => erreur.code === 1);
  }
});

test("Compose sépare web et updater autour d'un volume nommé", () => {
  const compose = readFileSync(join(RACINE, "compose.yml"), "utf8");
  assert.match(compose, /services:\n  web:/);
  assert.match(compose, /  updater:/);
  assert.match(compose, /refuges-data:\/usr\/share\/nginx\/html\/data:ro/);
  assert.match(compose, /refuges-data:\/usr\/share\/nginx\/html\/data\n/);
  assert.doesNotMatch(compose, /depends_on:/);
});

test("le Dockerfile fournit les targets web et updater", () => {
  const dockerfile = readFileSync(join(RACINE, "Dockerfile"), "utf8");
  assert.match(dockerfile, / AS updater/);
  assert.match(dockerfile, / AS web/);
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/local\/bin\/updater-entrypoint"\]/);
  assert.doesNotMatch(dockerfile, /40-start-refuges-refresh/);
});
