# Suivi de la fusion

## Phase actuelle

Phase 5 - Host et permissions.

- Back : validé (Vitest 45/45, scripts `scenario`, `presence`, `expiry`, `disconnect` verts).
- Front : F-1 à F-5 livrés. F-6 (écran de fin) à valider.
- Corrections complémentaires en cours : sortie de salle (joueur et animateur), timers de fermeture, nettoyage des salles sans participant (voir section dédiée).

## Étapes de la roadmap

- [x] Phase 0 — Nettoyage préalable
- [x] Phase 1 — Copie du moteur et adaptation CJS
- [x] Phase 2 — Adaptation du schéma YAML
- [x] Phase 3 — Validation du YAML à la création de salle
- [x] Phase 4 — Migration Prisma et association salle ↔ YAML
- [ ] Phase 5 — Host et permissions (F-6 et sortie de salle à valider)
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
- Seul `Room.ownerId` pilote la partie. Chaque `room:*` de pilotage vérifie `room.ownerId === userId` avant tout appel au moteur (`runAsOwner`).
- Un joueur ne répond que pendant `question_active`, une seule fois par question.
- L'host n'est jamais joueur. `addPlayer` ne reçoit que des `userId` de membres.
- Identifiant du joueur dans le moteur = `userId`.
- Convention d'événements `room:*` conservée (pas de `host:*`).

**Visibilité**
- Les bonnes réponses ne sont jamais envoyées pendant `question_active`. Elles apparaissent en `correction`.
- Les valeurs de réponse des joueurs (`currentQuestionAnswers`) ne sont exposées qu'en `correction` et `finished`. Pendant `question_active` et `question_locked`, le snapshot contient seulement `answeredPlayerIds`.
- Le classement final n'est diffusé qu'aux joueurs connectés.

**Verrouillage**
- Automatique dès que tous les joueurs connectés ont répondu, ou immédiatement s'il n'y a personne de connecté (host compris).
- Pas de timer par question (`time_limit`) en Phase 5.

**Déconnexion de l'host**
- Compte à rebours de 45 secondes, démarré à la fermeture du dernier socket de l'owner (pas d'un seul onglet). Valeur réduite depuis 2 minutes.
- Pendant le délai : si une question est active, elle est verrouillée. Les joueurs voient un bandeau « L'animateur est déconnecté. Attendez son retour. ».
- Retour dans le délai : compte à rebours annulé, partie reprise à l'étape courante. Une question manuelle en attente reste à juger.
- Retour détecté par une connexion socket authentifiée dont `userId === ownerId`.
- Un joueur qui rejoint pendant l'absence de l'host reçoit immédiatement `game:host-status` avec `connected: false`.
- Expiration, question manuelle non jugée en cours : elle compte comme incorrecte, la partie s'arrête à cette question (les suivantes ne sont pas jouées ni évaluées). `Room.state` passe à `FINISHED`, le moteur est libéré, le classement final part aux seuls joueurs connectés.
- Expiration dans le lobby : suppression de la salle, membres renvoyés à l'accueil.
- Une question manuelle déjà jugée garde son verdict. Seule la dernière sans verdict compte comme incorrecte.

**Déconnexion des joueurs (en partie)**
- Un joueur déconnecté reste en base, marqué `connected: false`. Il peut revenir.
- Si plus aucun joueur n'est connecté pendant 30 secondes, la partie est fermée (`FINISHED`), le moteur libéré, et le classement final n'est pas diffusé faute de destinataire. *(Prompt en préparation.)*

**Sortie de salle (en cours)**
- Un joueur peut quitter via « Quitter la salle », après confirmation. En lobby, il est retiré de la base. En partie, il perd sa place en base et ne peut plus revenir ; son score reste dans le moteur jusqu'à la fin.
- L'animateur peut fermer la salle via « Fermer la salle », après confirmation. Les joueurs reçoivent `room:closed`, sont redirigés vers l'accueil après 3 secondes, et la salle est supprimée (cascade sur participants et messages).
- Le tchat est masqué côté front dès que la partie est lancée. Le serveur accepte encore les messages (à traiter si besoin).

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
  - [x] `isCorrect` et valeurs masqués dans `currentQuestionAnswers` hors `correction`/`finished` ; ajout de `answeredPlayerIds`.
  - Statut : Vitest 45/45.

- [x] **Étape 3 — Permissions côté serveur**
  - [x] `room:lock`, `room:correct`, `room:next`, `room:validate` : vérification `ownerId` avant le moteur (`runAsOwner`), diffusion du snapshot après action.
  - [x] `room:answer` : membre de la salle, refus de l'owner, erreurs de `submitAnswer` capturées.
  - [x] `room:start` : création du moteur, ajout des membres (owner exclu), `startGame`, `markInProgress`, diffusion du snapshot. Moteur libéré en cas d'échec.
  - [x] Un joueur absent du moteur reçoit un refus propre (P-C).
  - Statut : Vitest 45/45, build Docker OK.

- [x] **Étape 4 — Présence de l'host**
  - [x] Compteur de sockets de l'owner par salle (`ownerSockets`).
  - [x] Délai de 45 secondes à zéro socket, annulé au retour (`room:join`).
  - [x] Notification `game:host-status` (`connected: true/false`) à la salle, et à un joueur qui rejoint pendant l'absence.
  - [x] Joueurs non retirés de la base en `IN_PROGRESS` (`setPlayerConnected`).
  - Statut : scripts `presence.mjs` et `expiry.mjs` à relancer avec le nouveau délai (argument `45000`).

- [x] **Étape 5 — Verrouillage automatique**
  - [x] `shouldAutoLock()` dans le moteur, appelé après chaque `room:answer` accepté.
  - [x] Verrouillage à la déconnexion d'un joueur dans `leaveSocket` (sans retrait de la base) — P-A.
  - [x] Tests unitaires (4 cas).

- [x] **Étape 6 — Fin de partie**
  - [x] Expiration du délai en partie : `FINISHED`, moteur libéré, `game:ended` aux seuls joueurs.
  - [x] Expiration dans le lobby : suppression de la salle.
  - [x] Fin naturelle (`nextQuestion` sur la dernière question) : snapshot final, `finishGame`, `game:ended`.
  - [x] Robustesse de `finishGame` : `markFinished` réessayé une fois, erreur journalisée en cas de double échec, moteur libéré dans tous les cas — P-B.
  - [ ] Limite résiduelle : en cas de double échec, la salle reste `IN_PROGRESS` sans moteur. À rattraper au démarrage (Phase 7).

- [~] **Étape 7 — Tests**
  - [x] `scripts/scenario.mjs` : vert (start, permissions, réponses, verrouillage auto, fin naturelle, reconnexion dans la seconde, masquage des valeurs pendant `question_active`).
  - [x] `scripts/disconnect.mjs` : 20/20 (verrouillage à la déconnexion, masquage des valeurs pendant la question 2).
  - [x] `scripts/presence.mjs` (9 contrôles) et `scripts/expiry.mjs` (7 contrôles) : verts avant la baisse du délai à 45 s.
  - [x] Vérification `FINISHED` stricte en base (P-G).
  - [ ] À ajouter : contrôle qu'un joueur rejoignant pendant l'absence de l'host reçoit `game:host-status` `connected: false`.
  - [ ] À ajouter : contrôles de sortie de salle (`room:quit`, `room:close`, retrait de la liste, 404 après fermeture).
  - [ ] À ajouter : contrôles des timers de fermeture (30 s joueurs, 45 s host).

## Front (suivi)

| Ticket | Contenu | Statut |
|---|---|---|
| F-1 | Composable `useRoomGame.ts` (snapshot, host-status, ended, answeredIds, reset) | Livré |
| F-2 | Lobby et bouton « Lancer la partie » (owner), suppression du bloc debug | Livré, vérifié à l'écran |
| F-3 | Question active, `QuestionCard.vue`, envoi de `room:answer`, compteur owner | Livré, première question validée en test |
| F-4 | Contrôles owner (`OwnerControls.vue`), correction joueur (`CorrectionView.vue`), timeout de 5 s sur les actions owner | Livré (correctif « Vous n'avez pas répondu » appliqué) |
| F-5 | Bandeau de présence (`HostStatusBanner.vue`), émission de `game:host-status` au joueur qui rejoint | Livré (message corrigé pour le lobby et la partie) |
| F-6 | Écran de fin (`FinalRanking.vue`), classement animateur et joueur | En attente de validation |
| Sortie | Modale `QuitConfirmModal.vue`, boutons quitter/fermer, `room:closed`, masquage du tchat | En attente (prompt rédigé) |

## Suivi des prompts de finition de la Phase 5

- [x] P-A — Verrouillage à la déconnexion d'un joueur
- [x] P-B — Robustesse de `finishGame`
- [x] P-C — Refus propre d'un joueur absent du moteur
- [x] P-D — Tests garde-fous moteur (45/45)
- [x] P-E — `presence.mjs` (9 contrôles)
- [x] P-F — `expiry.mjs` (7 contrôles)
- [x] P-G — Vérification `FINISHED` stricte en base
- [x] P-A bis — `disconnect.mjs` (20 contrôles)
- [x] P-H — Timers de fermeture (30 s joueurs, 45 s host) et correction de `leaveSocket` (décrément du compteur animateur si la salle n'est plus lisible, journalisation dans `handleDisconnect`)
- [x] P-I — Nettoyage périodique des salles `WAITING` sans participant (> 2 min)
- [x] P-J — Sortie de salle joueur et fermeture par l'animateur (`room:quit`, `room:close`, `room:closed`, `QuitConfirmModal`, masquage du tchat)
- [x] F-6 — Écran de fin (voir section Front)

## Points d'attention

- **Chevauchement** : P-H, P-J modifient tous deux `leaveSocket` et `room.gateway.ts`. Les appliquer dans l'ordre P-H, puis P-J.
- **Salles fantômes** : une salle créée par `POST /api/rooms` sans arrivée de l'animateur sur sa page n'a aucun timer et reste en base. P-I traite ce cas. En attendant, nettoyage manuel :
  ```sql
  DELETE FROM "Room" WHERE state = 'WAITING' AND id NOT IN (SELECT "roomId" FROM "RoomParticipant");
  ```
- **Fragilité de `leaveSocket`** : si `roomService.getById` échoue (salle supprimée), le compteur de l'animateur n'est pas décrémenté et aucun délai n'est armé. Corrigé par P-H.
- **Session partagée entre fenêtres** : `localStorage` est commun aux fenêtres d'un même navigateur (privée comprise). Pour tester plusieurs utilisateurs, utiliser des navigateurs ou profils distincts.
- **Redémarrage** : la `Map` des moteurs est en mémoire. Une salle `IN_PROGRESS` sans moteur après redémarrage doit passer à `FINISHED` au démarrage (Phase 7).
- **Tchat pendant la partie** : masqué côté front uniquement. Le serveur accepte toujours `room:chat-send`.

## Modifications réalisées

- Baseline : commit `d34c936` sur `fusion/quiz-engine` (suivi initial inclus).
- Phase 1 : moteur copié dans `apps/api/src/quiz-engine/`, tests portés dans `apps/api/test/quiz-engine/`.
- Phase 2 : `schema.ts`, `models/quiz.ts`, `normalize.ts`, `parser/index.ts` adaptés. Fixtures au format courant dans `apps/api/test/fixtures/`.
- Phase 3 : `CreateRoomSchema` reçoit `quizYaml`, `RoomService.create` valide le YAML via `parseQuizString` et renvoie les erreurs dans `issues`. `HomeView.vue` affiche les erreurs dans la modale (`ApiValidationError` dans `services/room.ts`).
- Phase 4 : modèles `Quiz`, `Question`, `Answer` supprimés de Prisma ; `Room` porte `quizYaml`. Contrôleurs et seed de quiz supprimés. Choix de quiz retiré de `HomeView.vue` et `RoomView.vue`.
- Phase 5 (front) : `useRoomGame.ts`, `RoomView.vue`, `QuestionCard.vue`, `OwnerControls.vue`, `CorrectionView.vue`, `HostStatusBanner.vue`. `shallowRef` pour le socket.
- Branches : travail en cours sur `fusion/phase-5`.

## Vérifications de référence

- `docker compose up --build` : db, api et web démarrent ; `prisma db push` reporte le schéma synchronisé ; routes `/api/rooms`, `/api/auth`, `/api/health` mappées.
- Build web : `vite build` passe. À compléter par `npx vue-tsc --noEmit -p apps/web` (non lancé à ce jour).
- Parcours validés par l'utilisateur : création de compte, connexion, création de salle, tchat, rejoindre une salle, lancement de partie, première question affichée.
- Quiz de démonstration « Quiz Normandie et Bretagne » (6 questions, image et extrait YouTube) : à tester en partie.

## Problèmes rencontrés

- Image Docker API périmée : après modification du gateway, relancer `docker compose up -d --build api` avant de rejouer les scripts.
- Nom de base `resto` hérité du `.env` (corrigé : base `quizz`).
- `DATABASE_URL` désalignée (erreur P1000 sur le rôle `resto`), corrigée.
- `prisma` ne fonctionne pas en local (dépendance `effect` incohérente) : compilation et génération du client passent par Docker.
- Fins de ligne CRLF détectées, à normaliser avec `.gitattributes`.
- Socket.IO observé en polling ; upgrade WebSocket à vérifier.
- `Dockerfile` API : `prisma db push --accept-data-loss` au démarrage. À remplacer par `migrate deploy` avant mise en production, ce qui suppose une migration initiale (`prisma migrate dev --name init`).
- Test multi-utilisateurs : fenêtres privées partageant `localStorage`, donc sessions confondues (voir Points d'attention).
- Salles bloquées après fermeture d'onglet : cause identifiée (salles sans participant, `leaveSocket` fragile). Corrections P-H et P-I.

## Phase 0 — Nettoyage préalable : terminée

- Tâche 1 : suppression du compte admin — validée. Un ancien compte admin peut subsister dans une base existante ; il disparaît au reset.
- Tâche 2 : `JWT_SECRET` obligatoire — validée (cas nominal et négatif).
- Tâche 3 : URL relatives — validée (requêtes via nginx sur `localhost:8080`, Socket.IO inclus).
- Tâche 4 : suppression de l'ancien seed — terminée.
- Base renommée `quizz`, volume recréé, `.env` unique à la racine.

## Phase 1 — Copie du moteur et adaptation CJS : terminée

- `parseQuizFile` et `node:fs` retirés du parser.
- Dépendances ajoutées : `js-yaml`, `@types/js-yaml`, `vitest`.
- Reporté : test unitaire de `verifyToken`.

## Reste à faire (hors phase 5)

- `.gitattributes` pour normaliser les fins de ligne.
- Test unitaire de `verifyToken`.
- Upgrade WebSocket à vérifier.
- Limite du nombre de questions (proposition : 100), non tranchée.
- Délai de grâce à la déconnexion des joueurs (Phase 7) : remplacé en partie par le timer de 30 s (P-H).