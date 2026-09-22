# trouve-mon-refuge

Carte des cabanes et refuges (données [refuges.info](https://www.refuges.info/)), publiée sur
<https://trouve-mon-refuge.liberateur.fr>.

## Lancer en local

```bash
docker build -t trouve-mon-refuge .
docker run --rm -p 8080:80 trouve-mon-refuge
```

Puis ouvrir <http://localhost:8080>.
