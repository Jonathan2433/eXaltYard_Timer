# Vérifications manuelles — eXaltYard Timer

Les vérifications suivantes ne demandent aucun framework et peuvent être réalisées dans le navigateur après `docker compose up -d`.

| Cas | Action | Résultat attendu |
|---|---|---|
| Ajout | Configuration → ajouter une boucle | Une nouvelle dernière ligne reprend la durée précédente et le total change partout. |
| Suppression | Supprimer la dernière boucle | Seulement la dernière ligne disparaît ; une boucle minimale reste toujours. |
| Temps cumulés | Configurer trois boucles de 10:00, 10:00 et 09:30 | La colonne « Temps cumulé » affiche respectivement 10:00, 20:00 et 29:30. |
| Chargement des cumuls | Recharger normalement la page après déploiement, puis ouvrir Configuration | Chaque ligne conserve quatre cellules alignées et affiche son temps cumulé ; « Modifier » reste dans la colonne « Action ». |
| Règle 01:00 / 2 boucles | Avec 6 boucles et une boucle 1 à 10:00, prévisualiser 01:00 toutes les 2 boucles | Les temps maximum proposés sont 10:00, 10:00, 09:00, 09:00, 08:00 et 08:00 ; les cumuls sont recalculés sans modifier le programme actif. |
| Règle 00:30 / 1 boucle | Prévisualiser 00:30 toutes les 1 boucle | Les temps maximum proposés sont 10:00, 09:30, 09:00, 08:30, 08:00 et 07:30. |
| Règle 01:00 / 1 boucle | Prévisualiser puis appliquer 01:00 toutes les 1 boucle | Les temps deviennent 10:00, 09:00, 08:00, 07:00, 06:00 et 05:00 et la règle est persistée. |
| Annulation de règle | Prévisualiser une règle puis annuler | Les durées réellement enregistrées réapparaissent sans modification. |
| Règle invalide | Prévisualiser une diminution qui rendrait une boucle nulle ou négative | L’application est bloquée et le numéro de la première boucle invalide est indiqué. |
| Ajout avec règle | Appliquer une règle puis ajouter une boucle | La nouvelle boucle reçoit la durée calculée par la règle, pas une simple copie de la précédente. |
| Programme personnalisé | Modifier manuellement une durée puis appliquer une règle globale | Le programme est signalé comme personnalisé et une confirmation prévient du remplacement des ajustements manuels. |
| Règle pendant course | Démarrer ou terminer une course puis ouvrir Configuration | Les paramètres de règle sont verrouillés jusqu’au Reset ; les fonctions existantes sur les boucles restent disponibles. |
| Décalage négatif | Modifier 09:30 en 09:00, prévisualiser puis appliquer | La ligne et toutes les suivantes perdent 00:30 ; les précédentes restent identiques. |
| Décalage positif | Modifier une durée en l’augmentant | La durée et toutes les suivantes gagnent le même écart. |
| Annulation | Prévisualiser puis Annuler | Aucune durée ne change. |
| Validation | Saisir `00:00`, `09:78` ou un format incorrect | Un message clair bloque l’application. |
| Démarrage / enchaînement | Pour un test rapide, créer deux boucles de 00:05, puis démarrer | Signal de départ ascendant, puis transition sonore marquée et démarrage de la seconde boucle. |
| Pause / reprise | Mettre en pause, attendre 10 s, reprendre | Le temps ne baisse pas durant la pause ; les horaires futurs sont décalés d’environ 10 s. |
| Alertes | Avec une boucle de 00:31 puis de 00:12 | Une alerte à deux tons à 30 s, une alerte à trois tons à 10 s et un bip progressif de 5 à 1 s. |
| Plein écran | Cliquer sur « Plein écran » puis sur `F` ou `Échap` | Seul le panneau de course est visible ; il contient le compteur de boucles, le temps restant, le temps limite, la prochaine boucle et le temps cumulé. Le retour restitue l'écran complet. |
| Cumul pendant la course | Lancer les trois boucles 10:00, 10:00 et 09:30 puis naviguer entre elles | Le panneau principal affiche 10:00, 20:00 puis 29:30 ; une pause ne change pas ces valeurs. |
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
