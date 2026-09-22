# trouve-mon-refuge

Carte des cabanes et refuges (données [refuges.info](https://www.refuges.info/)), publiée sur
<https://trouve-mon-refuge.liberateur.fr>.

## Lancer en local

```bash
docker compose up --build -d
```

Puis ouvrir <http://localhost:8080>. Le port peut être changé avec
`TMR_PORT=18080 docker compose up --build -d`.

La stack contient deux services et un volume partagé :

- `web` sert le site et monte le snapshot en lecture seule ;
- `updater` récupère les données et monte le snapshot en lecture/écriture ;
- `refuges-data` conserve le snapshot entre les recréations de conteneurs.

Au premier démarrage, la page affiche son erreur réseau jusqu'à la création du
snapshot. Supercronic vérifie ensuite le snapshot tous les jours à 04:20 UTC ;
le téléchargement n'a lieu que si les données dépassent 7 jours. L'updater
devient `unhealthy` après 14 jours sans mise à jour réussie, sans arrêter nginx.

## Tests

Lancés par la CI (Forgejo Actions) ; en local : `node --test tests/*.test.mjs`.
