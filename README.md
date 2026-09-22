# trouve-mon-refuge

Carte des cabanes et refuges (données [refuges.info](https://www.refuges.info/)), publiée sur
<https://trouve-mon-refuge.liberateur.fr>.

Le conteneur crée le snapshot local (`data/refuges.json`) avant le premier démarrage
de nginx, puis vérifie une fois par jour s'il dépasse 7 jours. Si Refuges.info est
indisponible, le dernier snapshot valide continue d'être servi ; sans snapshot, le
conteneur échoue au démarrage.

## Lancer en local

```bash
docker build -t trouve-mon-refuge .
docker run --rm -p 8080:80 trouve-mon-refuge
```

Puis ouvrir <http://localhost:8080>.

## Tests

Lancés par la CI (Forgejo Actions) ; en local : `node --test tests/page.test.mjs tests/update-refuges.test.mjs`.
