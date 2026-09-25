# Vérifications manuelles — eXaltYard Timer

Les vérifications suivantes ne demandent aucun framework et peuvent être réalisées dans le navigateur après `docker compose up -d`.

| Cas | Action | Résultat attendu |
|---|---|---|
| Ajout | Configuration → ajouter une boucle | Une nouvelle dernière ligne reprend la durée précédente et le total change partout. |
| Suppression | Supprimer la dernière boucle | Seulement la dernière ligne disparaît ; une boucle minimale reste toujours. |
| Décalage négatif | Modifier 09:30 en 09:00, prévisualiser puis appliquer | La ligne et toutes les suivantes perdent 00:30 ; les précédentes restent identiques. |
| Décalage positif | Modifier une durée en l’augmentant | La durée et toutes les suivantes gagnent le même écart. |
| Annulation | Prévisualiser puis Annuler | Aucune durée ne change. |
| Validation | Saisir `00:00`, `09:78` ou un format incorrect | Un message clair bloque l’application. |
| Démarrage / enchaînement | Pour un test rapide, créer deux boucles de 00:05, puis démarrer | Signal de départ ascendant, puis transition sonore marquée et démarrage de la seconde boucle. |
| Pause / reprise | Mettre en pause, attendre 10 s, reprendre | Le temps ne baisse pas durant la pause ; les horaires futurs sont décalés d’environ 10 s. |
| Alertes | Avec une boucle de 00:31 puis de 00:12 | Une alerte à deux tons à 30 s, une alerte à trois tons à 10 s et un bip progressif de 5 à 1 s. |
| Plein écran | Cliquer sur « Plein écran » puis sur `F` ou `Échap` | Seul le panneau de course est visible ; il contient le compteur de boucles, le temps restant, le temps limite et la prochaine boucle. Le retour restitue l'écran complet. |
| Future pendant course | Démarrer, puis changer une boucle à venir | Les boucles terminées restent verrouillées et les heures futures sont recalculées. |
| Actuelle pendant course | Modifier la boucle en cours | Une confirmation apparaît ; le temps actif écoulé est conservé. |
| Terminée | Laisser expirer la dernière boucle | `COURSE TERMINÉE` et le total de boucles terminées apparaissent ; pas de dépassement. |
| Persistance | Enregistrer, recharger la page | Programme et préférence de son sont retrouvés. |
| Nombre variable | Ajouter plusieurs boucles avant le départ | Le compteur proéminent, le tableau et la fin de course utilisent le nouveau total. |

Pour vérifier la santé statique minimale :

```bash
node --check app/app.js
docker compose config
```
