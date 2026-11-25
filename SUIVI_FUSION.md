# Suivi de la fusion

## Phase actuelle
Phase 5 - Host et permissions (à démarrer)

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
- Départ de l'host en cours de partie (roadmap §6, à traiter en Phase 5).
- Délai de grâce à la déconnexion (Phase 7).