# eXaltYard Timer

Application locale de direction de course : elle enchaîne automatiquement un programme de boucles, avec un grand affichage, alertes sonores et édition du programme sans dépendance réseau.

## Lancement

Prérequis : Docker et Docker Compose.

```bash
docker compose up -d
```

Ouvrir ensuite [http://localhost:8080](http://localhost:8080).

Autres commandes utiles :

```bash
# Arrêter le service
docker compose down

# Reconstruire après une modification
docker compose up -d --build

# Suivre les journaux du serveur web
docker compose logs -f
```

## Utilisation

1. Ouvrir **Configuration**, vérifier les durées, puis enregistrer le programme.
2. Utiliser **Tester le son** (et vérifier la sortie Bluetooth ou filaire) avant le départ.
3. Activer le plein écran si nécessaire : seul le panneau de course est alors affiché (boucle, chronomètre, temps limite, prochaine boucle et temps cumulé).
4. Cliquer sur **Démarrer la course**. Les boucles s’enchaînent automatiquement.

La configuration accepte les durées `MM:SS`. Pour chaque boucle, elle affiche aussi le temps cumulé depuis la première boucle. La règle de diminution permet de choisir indépendamment le temps retiré à chaque palier et le nombre de boucles conservant la même durée. Sa prévisualisation recalcule dans le tableau les temps maximum et cumulés sans modifier le programme actif ; il faut ensuite l’appliquer explicitement.

La durée de la boucle 1 sert de référence à la règle. Par exemple, avec une première boucle à `10:00`, retirer `01:00` toutes les 2 boucles produit `10:00`, `10:00`, `09:00`, `09:00`… Une règle qui rendrait une boucle nulle ou négative est refusée. La règle globale est verrouillée pendant et après la course, jusqu'au Reset.

Une durée reste modifiable manuellement : l’écart est appliqué à la boucle choisie et à toutes les suivantes. Le programme est alors identifié comme personnalisé et la prochaine application de la règle globale demande confirmation. Lorsqu'une règle est active, une boucle ajoutée reçoit automatiquement la durée calculée par cette règle ; sinon elle reprend la dernière durée. Seule la dernière boucle est supprimable.

Pendant la course, les boucles terminées sont verrouillées. La boucle actuelle demande une confirmation spécifique. Une modification future recalcule immédiatement la timeline affichée ; une modification de la boucle actuelle préserve le temps actif déjà écoulé. Si sa nouvelle limite est déjà atteinte, le passage à la boucle suivante se fait proprement.

Les commandes clavier sont : `Espace` (démarrer / pause / reprendre), `←` et `→` (boucles), `F` (plein écran), `Échap` (fermer une boîte de dialogue).

## Chronométrage et timeline

Le temps restant est calculé depuis des timestamps et le temps réel, à chaque rafraîchissement (`requestAnimationFrame`) : il ne dépend pas d’une succession de `setTimeout`. La timeline expose les départs et fins théoriques de chaque boucle.

Une pause mémorise exactement le temps actif déjà consommé. À la reprise, ses millisecondes sont ajoutées à la fin de la boucle actuelle et à toutes les échéances suivantes. Si le navigateur perd le focus, le prochain rendu recalcule le temps restant à partir de l’horloge réelle.

## Affichage et identité visuelle

L'écran principal reprend les codes de la course eXaltYard : bleu nuit, rose fuchsia, jaune vif et détails graphiques dynamiques. La boucle en cours et le total de boucles forment un compteur distinct, volontairement plus visible que les informations secondaires.

Le panneau de course affiche le temps cumulé théorique jusqu'à la boucle courante, sans intégrer les pauses. Le plein écran cible uniquement ce panneau et masque donc l'en-tête, les commandes, les messages et la timeline. Les raccourcis restent utilisables : `F` bascule ce mode et `Échap` le ferme.

## Son

Les signaux sont générés localement avec Web Audio API : un signal de départ ascendant, une transition de boucle à deux impacts, une alerte à deux tons à 30 s, une alerte à trois tons à 10 s, un décompte progressif de 5 à 1, et une mélodie de fin de course. Aucun fichier audio ni CDN n’est requis.

Les navigateurs imposent généralement un premier geste utilisateur avant d’autoriser le son. Pour cette raison, testez le son (ou lancez la course) après avoir connecté l’enceinte et autorisé la lecture par le navigateur. Le bouton **Son** conserve aussi la préférence de coupure.

## Persistance et structure

Le programme, sa règle de diminution et la préférence audio sont conservés uniquement dans `localStorage` de ce navigateur. Les données absentes ou invalides sont remplacées par un programme sûr de 25 boucles (deux boucles à 10:00, puis une diminution de 30 secondes tous les deux tours).

```text
.
├── Dockerfile
├── docker-compose.yml
├── README.md
└── app/
    ├── index.html
    ├── style.css
    ├── app.js
    └── sounds/        # réservé aux sons locaux éventuels
```

## Vérifications manuelles

Voir [TESTING.md](TESTING.md) pour une checklist couvrant l’ajout/suppression, les décalages positifs et négatifs, pause/reprise, alertes, modifications pendant course, fin et persistance.
