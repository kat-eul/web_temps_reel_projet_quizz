# Suivi de la fusion

## Phase actuelle
Phase 4 - Migration Prisma et association salle ↔ YAML (en cours : résidus à nettoyer)

## Étapes de la roadmap
- [x] Phase 0 — Nettoyage préalable
- [x] Phase 1 — Copie du moteur et adaptation CJS
- [x] Phase 2 — Adaptation du schéma YAML
- [x] Phase 3 — Validation du YAML à la création de salle
- [ ] Phase 4 — Migration Prisma et association salle ↔ YAML (majoritairement faite)
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
- Phase 2 : `schema.ts`, `models/quiz.ts`, `normalize.ts`, `parser/index.ts` adaptés. Fixtures `gender-reveal` et `invalid` au format courant, dans `apps/api/test/fixtures/`.
- Phase 3 : `CreateRoomSchema` reçoit `quizYaml`, `RoomService.create` valide le YAML via `parseQuizString`, et renvoie les erreurs dans `issues`. `HomeView.vue` affiche la liste des erreurs dans la modale (`ApiValidationError` dans `services/room.ts`).
- Phase 4 (partielle) : modèles `Quiz`, `Question`, `Answer` supprimés de Prisma ; `Room` porte `quizYaml`. `QuizController`, `QuizListController`, `QuizService` et `seed-quiz.ts` supprimés.

## Vérifications de référence (avant fusion)
- `docker compose up` : db, api et web démarrent ; `prisma db push` reporte le schéma déjà synchronisé.
- Parcours fonctionnels validés par l'utilisateur : création de compte, connexion, création de salle, tchat, rejoindre une salle.

## Vérifications après Phase 2 et Phase 3
- `npx vitest run` dans `apps/api` : 36 tests verts (15 moteur, 21 parser).
- Build Docker : `tsc` et `vite build` passent, l'API démarre.
- Création de salle avec le quiz `gender-reveal` : OK.
- Création de salle avec le quiz `invalid` : refusée, les deux erreurs sont affichées dans la modale.

## Problèmes rencontrés
- Nom de base `resto` hérité du `.env` (corrigé : base `quizz`).
- `DATABASE_URL` désalignée (erreur P1000 sur le rôle `resto`), corrigée.
- `prisma` ne fonctionne pas en local (dépendance `effect` incohérente sur la machine de développement) : la compilation et la génération du client passent par Docker.
- Fins de ligne CRLF détectées, à normaliser avec `.gitattributes`.
- Socket.IO observé en polling ; upgrade WebSocket à vérifier.
- `Dockerfile` API : `prisma db push --accept-data-loss` au démarrage (à remplacer par `migrate deploy`).
- Route `/api/quizz` appelée par le front après suppression du contrôleur : corrigé en retirant le chargement des quiz de `HomeView.vue`.

## Phase 0 — Nettoyage préalable : terminée
- Tâche 1 : suppression du compte admin — validée. Fichiers : `auth.service.ts`, `LoginView.vue`. Un ancien compte admin peut subsister dans une base existante ; il disparaît au reset.
- Tâche 2 : `JWT_SECRET` obligatoire — validée (cas nominal et négatif). Fichiers : `auth.service.ts`, `docker-compose.yml`.
- Tâche 3 : URL relatives — validée (requêtes via nginx sur `localhost:8080`, Socket.IO inclus). Fichiers : `services/auth.ts`, `services/room.ts`, `view/RoomView.vue`.
- Tâche 4 : suppression de l'ancien seed — partielle, validée. Résidus traités en Phase 4 : `QuizService`, `QuizListController`, `services/quiz.ts`, choix de quiz dans `HomeView.vue` (ce dernier est désormais retiré).
- Base renommée `quizz`, volume recréé, `.env` unique à la racine.

## Phase 1 — Copie du moteur et adaptation CJS : terminée
- Moteur copié dans `apps/api/src/quiz-engine/` ; `parseQuizFile` et `node:fs` retirés.
- Tests portés dans `apps/api/test/quiz-engine/`.
- Dépendances ajoutées : `js-yaml`, `@types/js-yaml`, `vitest` (v5.1.1 ; compatibilité avec Vite 6 de `apps/web` vérifiée par le build web).
- Reporté : test unitaire de `verifyToken` (à faire, Vitest est disponible).

## Reste à faire en Phase 4
- Supprimer `apps/web/src/services/quiz.ts`, `QuizView.vue` (déjà retiré selon la tâche 4) et la route `/quiz` si elle subsiste.
- Retirer `RoomStartedSchema.question` et `GameQuestionSchema` de `packages/shared/src/room.ts`.
- Remplacer `prisma db push --accept-data-loss` par `prisma migrate deploy` dans le `Dockerfile`, avant toute mise en production.
- Vérifier avec `grep` qu'aucune référence à `Quiz`, `Question` ou `quizId` ne subsiste dans `apps/`.

## Points restés ouverts
- Limite du nombre de questions : proposition de 100, non tranchée.
- Départ de l'host en cours de partie (roadmap §6, à traiter en Phase 5).
- Délai de grâce à la déconnexion (Phase 7).
- Suppression de `packages/core` une fois les tests migrés (fait pour les tests, le paquet reste à retirer).