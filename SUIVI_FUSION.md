# Suivi de la fusion

## Phase actuelle
Phase 5 - Host et permissions (code terminé, Vitest 45/45 ; scripts Node de parcours écrits mais à rejouer via Docker ; front F-1 à F-6 à rédiger)

## Étapes de la roadmap
- [x] Phase 0 — Nettoyage préalable
- [x] Phase 1 — Copie du moteur et adaptation CJS
- [x] Phase 2 — Adaptation du schéma YAML
- [x] Phase 3 — Validation du YAML à la création de salle
- [x] Phase 4 — Migration Prisma et association salle ↔ YAML
- [ ] Phase 5 — Host et permissions
- [ ] Phase 6 — Déroulement en temps réel
- [ ] Phase 7 — Déconnexions, reconnexions, capacité
- [ ] Phase 8 — Tests et validation globale

## Décisions (roadmap §0)
- Le projet quizz est le socle ; le moteur est copié dans `apps/api/src/quiz-engine/`.
- État de partie en mémoire ; médias en URL externes ; compte admin supprimé.
- Le YAML est stocké tel quel dans `Room.quizYaml` et validé à la création.

## Décisions prises en Phase 2
- `max_players` ignoré : c'est `nbMaxParticipants` de la salle qui prime. Le moteur reçoit la limite au constructeur.
- `theme`, `settings.mode` et `settings.show_answers` supprimés du schéma.
- `clip` : seul `start` est conservé, et uniquement pour les médias `youtube`.
- `time_limit` optionnel, sans valeur par défaut.
- Médias `image` et `audio` : URL `https://` obligatoire, `source` supprimé.
- Limite de taille du YAML : 32 Ko, vérifiée en octets avant le parsing.
- Fichiers `bebe_animaux.quiz.yml` et `comptines.quiz.yml` : n'existaient pas dans le dépôt, rien à supprimer.

## Décisions prises en Phase 5

**Permissions**
- Seul `Room.ownerId` pilote la partie. Chaque `room:*` de pilotage vérifie `room.ownerId === userId` dans le service, avant tout appel au moteur.
- Un joueur ne répond que pendant `question_active`, une seule fois par question.
- L'host n'est jamais joueur. `addPlayer` ne reçoit que des `userId` de membres.
- Identifiant du joueur dans le moteur = `userId`.
- Convention d'événements `room:*` conservée (pas de `host:*`).

**Visibilité**
- Les bonnes réponses ne sont jamais envoyées pendant `question_active`. Elles apparaissent en `correction`.
- Le classement final n'est diffusé qu'aux joueurs connectés.

**Verrouillage**
- Automatique dès que tous les joueurs connectés ont répondu, ou immédiatement s'il n'y a personne de connecté (host compris).
- Pas de timer par question (`time_limit`) en Phase 5.

**Déconnexion de l'host**
- Compte à rebours de 2 minutes, démarré à la fermeture du dernier socket de l'owner (pas d'un seul onglet).
- Pendant le délai : si une question est active, elle est verrouillée. Les joueurs voient « en attente du retour de l'host ».
- Retour dans le délai : compte à rebours annulé, partie reprise à l'étape courante. Une question manuelle en attente reste à juger.
- Retour détecté par une connexion socket authentifiée dont `userId === ownerId`.
- Expiration, question manuelle non jugée en cours : elle compte comme incorrecte, la partie s'arrête à cette question (les suivantes ne sont pas jouées ni évaluées). `Room.state` passe à `FINISHED`, le moteur est libéré, le classement final part aux seuls joueurs connectés.
- Expiration dans le lobby : suppression de la salle, membres renvoyés à l'accueil.
- Une question manuelle déjà jugée garde son verdict. Seule la dernière sans verdict compte comme incorrecte.

## Plan de la Phase 5
- [x] **Étape 1 — `GameService` (singleton)**
  - `Map<roomId, GameEngine>` créée au `room:start`, libérée en cas d'échec de démarrage, à la fin de partie et à l'expiration.
  - Orchestre le moteur, sans logique de jeu hors du moteur.
  - Gère les comptes à rebours de déconnexion de l'host, par salle (`startHostGrace`, `cancelHostGrace`).
  - Statut : créé, injecté, build Docker OK.

- [x] **Étape 2 — Adaptation du moteur**
  - [x] `addPlayer(userId, nickname, teamId?)` : identifiant = `String(userId)`.
  - [x] Étapes figées pendant l'absence de l'host : verrouillage de la question active à la déconnexion, puis expiration du délai (étape 4).
  - [x] Méthode de clôture à l'expiration : `closeOnExpiry()`, question manuelle non jugée → fausse, puis `finished`.
  - [x] `getSnapshot()` ne renvoie les bonnes réponses qu'en `correction` et `finished` (`maskQuestion`).
  - [x] `isCorrect` masqué dans `currentQuestionAnswers` hors `correction`/`finished`.
  - Statut : Vitest 42/42.

- [x] **Étape 3 — Permissions côté serveur**
  - [x] `room:lock`, `room:correct`, `room:next`, `room:validate` : vérification `ownerId` avant le moteur (`runAsOwner`), diffusion du snapshot après action.
  - [x] `room:answer` : membre de la salle, refus de l'owner, `isCorrect` masqué hors `correction`/`finished`, erreurs de `submitAnswer` capturées.
  - [x] `room:start` : création du moteur, ajout des membres (owner exclu), `startGame`, `markInProgress`, diffusion du snapshot. Moteur libéré en cas d'échec.
  - [x] Test : un joueur absent du moteur reçoit un refus propre (test moteur `submitAnswer lève GameEngineError pour un joueur inconnu` + `try/catch` dans le gateway) — P-C.
  - Statut : Vitest 45/45, build Docker OK, handlers abonnés.

- [x] **Étape 4 — Présence de l'host**
  - [x] Compteur de sockets de l'owner par salle (`ownerSockets`).
  - [x] Délai de 2 minutes à zéro socket, annulé au retour (`room:join`).
  - [x] Notification `game:host-status` (`connected: true/false`) aux joueurs.
  - [x] Joueurs non retirés de la base en `IN_PROGRESS` (`setPlayerConnected`).
  - Statut : build Docker OK. Script `scripts/presence.mjs` écrit (9 contrôles) ; exécution à rejouer.

- [x] **Étape 5 — Verrouillage automatique**
  - [x] `shouldAutoLock()` dans le moteur, appelé après chaque `room:answer` accepté.
  - [x] Tests unitaires (4 cas), Vitest 45/45.
  - [x] Verrouillage aussi à la déconnexion d'un joueur dans `leaveSocket` (`setPlayerConnected(false)` puis `shouldAutoLock()`, sans retrait de la base) — P-A.

- [x] **Étape 6 — Fin de partie**
  - [x] Expiration du délai en partie : `FINISHED`, moteur libéré, `game:ended` aux seuls joueurs.
  - [x] Expiration dans le lobby : suppression de la salle.
  - [x] Fin naturelle (`nextQuestion` sur la dernière question) : snapshot final diffusé, `finishGame` (`FINISHED`, moteur libéré, `game:ended`).
  - [x] Robustesse de `finishGame` : `markFinished` réessayé une fois, erreur journalisée en cas de double échec, moteur libéré dans tous les cas — P-B.
  - [ ] Limite résiduelle : en cas de double échec, la salle reste `IN_PROGRESS` en base sans moteur ; elle sera rattrapée par le nettoyage au démarrage (Phase 7).

- [~] **Étape 7 — Tests**
  - [x] Scénario Node `scripts/scenario.mjs` : 19/19 contrôles verts (start, permissions, réponses, verrouillage auto, fin naturelle).
  - [x] Pas de fuite des bonnes réponses dans le snapshot pendant `question_active` (tests du moteur et scénario).
  - [x] `room:start` par l'owner, salle retirée de la liste, snapshot reçu par les joueurs.
  - [x] `room:answer` accepté une fois, refusé en double, sans `isCorrect` en `question_active`.
  - [x] Un joueur qui envoie `room:lock` est refusé, l'état ne change pas.
  - [x] Fin naturelle de partie : `game:ended` reçu par les joueurs seuls, salle retirée de la liste.
  - [x] Tests moteur : 45/45 (vérifié en relançant Vitest) — P-D.
  - [x] Délai annulé au retour de l'host, expiration du délai : `scripts/presence.mjs` (9 contrôles), exécuté, RAS — P-E.
  - [x] Expiration avec question manuelle non jugée : `scripts/expiry.mjs` (7 contrôles, score 0 pour la réponse non jugée), exécuté, RAS — P-F.
  - [x] Verrouillage automatique à la déconnexion d'un joueur : `scripts/disconnect.mjs` exécuté après reconstruction de l'image API, 18/19 contrôles verts ; le 19e (`members`) est un défaut du script : `GET /api/rooms/:id` n'a pas de champ `members`, `nbParticipants: 3` prouve que Bob reste en base — P-A bis.
  - [~] Vérification en base après fin de partie : `scenario.mjs` contrôle `FINISHED` (ou 404) via `GET /api/rooms/:id` ; contrôle à resserrer pour exiger `FINISHED` strictement — P-G.

## Front (suivi parallèle)
Prérequis constatés (branche `fusion/phase-5`, commit `d1fc8b8`) :
- `RoomView.vue` (330 lignes) ne gère que le tchat : `room:join`, `room:leave`, `room:participant-updated`, `room:deleted`, `room:chat-history`, `room:chat-message`. Aucun écouteur `game:*`, aucun bouton « Lancer la partie ».
- Le composable `useRoomGame.ts` n'existe pas (aucun fichier `composables/`).
- Résidus à nettoyer : styles `.start-actions`, `.start-button`, `.start-error` sans balisage correspondant ; import orphelin `GameView` dans `router/index.ts` (fichier absent, import inutilisé).
- Le socket est créé dans `RoomView.vue` (`ref<Socket>`) : le composable devra le recevoir en paramètre.

Prompts à rédiger :
- [ ] F-1 — Composable `useRoomGame.ts` : écoute `game:snapshot`, `game:host-status`, `game:ended`
- [ ] F-2 — Lobby et bouton « Lancer la partie » (owner)
- [ ] F-3 — Question active et envoi de `room:answer`
- [ ] F-4 — Contrôles owner (lock, correct, next, validate)
- [ ] F-5 — Bandeau de présence de l'host
- [ ] F-6 — Écran de fin (`game:ended`)

## Suivi des prompts de finition de la Phase 5
- [x] P-A — Verrouillage à la déconnexion d'un joueur (code dans `leaveSocket`)
- [x] P-B — Robustesse de `finishGame` (nouvel essai de `markFinished`)
- [x] P-C — Refus propre d'un joueur absent du moteur
- [x] P-D — Tests garde-fous moteur (45/45, relancés)
- [x] P-E — `presence.mjs` (9 contrôles, exécuté, RAS)
- [x] P-F — `expiry.mjs` (7 contrôles, exécuté, RAS)
- [ ] P-G — Vérification `FINISHED` en base : resserrer le contrôle de `scenario.mjs` (et `presence.mjs`) pour exiger `FINISHED`, puis rejouer
- [x] P-A bis — Test de parcours du verrouillage à la déconnexion d'un joueur (`scripts/disconnect.mjs`, comportement validé ; reste à remplacer le contrôle `members` par `nbParticipants === 3`)
- [ ] F-1 à F-6 — Front (voir section Front)

Ancien « Reste à traiter (Prompt 4) » : `room:answer` (erreurs de `submitAnswer` capturées) et `room:start` (moteur, joueurs, snapshot) sont faits.



## Points d'attention
- **Chevauchement avec la Phase 7** : `leaveSocket` supprime aujourd'hui le `RoomParticipant` à la déconnexion. Il faut au minimum qu'un joueur déconnecté en cours de partie ne soit pas retiré de la base, pour le verrouillage automatique et le classement. Ce strict nécessaire est traité en Phase 5 (joueur conservé en base, marqué déconnecté, verrouillage automatique : P-A) ; le reste reste en Phase 7.
- **Redémarrage** : la `Map` est en mémoire. Une salle `IN_PROGRESS` sans moteur après redémarrage doit passer à `FINISHED` au démarrage (prévu en Phase 7, à anticiper si la base reste incohérente).

## Modifications réalisées
- Baseline : commit `d34c936` sur `fusion/quiz-engine` (suivi initial inclus).
- Phase 1 : moteur copié dans `apps/api/src/quiz-engine/`, tests portés dans `apps/api/test/quiz-engine/`.
- Phase 2 : `schema.ts`, `models/quiz.ts`, `normalize.ts`, `parser/index.ts` adaptés. Fixtures `gender-reveal` et `invalid` au format courant, dans `apps/api/test/fixtures/`.
- Phase 3 : `CreateRoomSchema` reçoit `quizYaml`, `RoomService.create` valide le YAML via `parseQuizString` et renvoie les erreurs dans `issues`. `HomeView.vue` affiche les erreurs dans la modale (`ApiValidationError` dans `services/room.ts`).
- Phase 4 : modèles `Quiz`, `Question`, `Answer` supprimés de Prisma ; `Room` porte `quizYaml`. `QuizController`, `QuizListController`, `QuizService`, `seed-quiz.ts`, `services/quiz.ts` et `packages/shared/src/quiz.ts` supprimés. Choix de quiz retiré de `HomeView.vue` et `RoomView.vue`.
- Branches : travail en cours sur `fusion/phase-4-nettoyage`, mergé dans la branche de fusion.

## Vérifications de référence (avant fusion)
- `docker compose up` : db, api et web démarrent ; `prisma db push` reporte le schéma déjà synchronisé.
- Parcours fonctionnels validés par l'utilisateur : création de compte, connexion, création de salle, tchat, rejoindre une salle.

## Vérifications après Phase 2, 3 et 4
- `npx vitest run` dans `apps/api` : 36 tests verts (15 moteur, 21 parser).
- Build Docker : `tsc` et `vite build` passent, l'API démarre avec les routes `/api/rooms`, `/api/auth`, `/api/health`.
- Création de salle avec le quiz `gender-reveal` : OK.
- Création de salle avec le quiz `invalid` : refusée, les deux erreurs sont affichées dans la modale.

## Problèmes rencontrés
- Image Docker API périmée : après une modification du gateway, relancer `docker compose up -d --build api` avant de rejouer les scripts de parcours (un échec du verrouillage à la déconnexion était dû à une image non reconstruite).
- Nom de base `resto` hérité du `.env` (corrigé : base `quizz`).
- `DATABASE_URL` désalignée (erreur P1000 sur le rôle `resto`), corrigée.
- `prisma` ne fonctionne pas en local (dépendance `effect` incohérente, `node_modules` non écrit sur le disque) : compilation et génération du client passent par Docker.
- Fins de ligne CRLF détectées, à normaliser avec `.gitattributes`.
- Socket.IO observé en polling ; upgrade WebSocket à vérifier.
- `Dockerfile` API : `prisma db push --accept-data-loss` au démarrage. À remplacer par `migrate deploy` avant mise en production, ce qui suppose une migration initiale (`prisma migrate dev --name init`).
- Route `/api/quizz` appelée par le front après suppression du contrôleur : corrigé.

## Phase 0 — Nettoyage préalable : terminée
- Tâche 1 : suppression du compte admin — validée. Fichiers : `auth.service.ts`, `LoginView.vue`. Un ancien compte admin peut subsister dans une base existante ; il disparaît au reset.
- Tâche 2 : `JWT_SECRET` obligatoire — validée (cas nominal et négatif). Fichiers : `auth.service.ts`, `docker-compose.yml`.
- Tâche 3 : URL relatives — validée (requêtes via nginx sur `localhost:8080`, Socket.IO inclus).
- Tâche 4 : suppression de l'ancien seed — terminée, résidus traités en Phase 4.
- Base renommée `quizz`, volume recréé, `.env` unique à la racine.

## Phase 1 — Copie du moteur et adaptation CJS : terminée
- `parseQuizFile` et `node:fs` retirés du parser.
- Dépendances ajoutées : `js-yaml`, `@types/js-yaml`, `vitest` (v5.1.1 ; compatibilité avec Vite 6 de `apps/web` vérifiée par le build web).
- Reporté : test unitaire de `verifyToken`.

## Reste à faire (hors phase 5)
- `.gitattributes` pour normaliser les fins de ligne.
- Test unitaire de `verifyToken`.
- Upgrade WebSocket à vérifier.

## Points restés ouverts
- Limite du nombre de questions : proposition de 100, non tranchée.
- `scenario.mjs` à rejouer après le resserrement de P-G ; `presence.mjs` et `expiry.mjs` ont été exécutés (RAS).
- Délai de grâce à la déconnexion des joueurs (Phase 7).