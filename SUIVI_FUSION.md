# Suivi de la fusion

## Phase actuelle
Phase 0 — Nettoyage préalable (aucune étape commencée)

## Étapes de la roadmap
- [x] Phase 0 — Nettoyage préalable
- [ ] Phase 1 — Copie du moteur et adaptation CJS
- [ ] Phase 2 — Adaptation du schéma YAML
- [ ] Phase 3 — Validation du YAML à la création de salle
- [ ] Phase 4 — Migration Prisma et association salle ↔ YAML
- [ ] Phase 5 — Host et permissions
- [ ] Phase 6 — Déroulement en temps réel
- [ ] Phase 7 — Déconnexions, reconnexions, capacité
- [ ] Phase 8 — Tests et validation globale

## Décisions (roadmap §0)
- Le projet quizz est le socle ; le moteur est copié dans `apps/api/src/quiz-engine/`.
- État de partie en mémoire ; médias en URL externes ; compte admin supprimé.

## Modifications réalisées
- Baseline : commit `d34c936` sur `fusion/quiz-engine` (suivi initial inclus).

## Vérifications de référence (avant fusion)
- `docker compose up` : db, api et web démarrent ; `prisma db push` reporte le schéma déjà synchronisé.
- Parcours fonctionnels validés par l'utilisateur : création de compte, connexion, création de salle, tchat, rejoindre une salle.

## Problèmes rencontrés
- Nom de base `resto` hérité du `.env` (sans impact fonctionnel).
- `Dockerfile` API : `prisma db push --accept-data-loss` au démarrage (à remplacer en Phase 4).
- URL `localhost:3000` en dur dans les services web (traité en Phase 0).



## Phase 0 — Nettoyage préalable : terminée
- Tâche 1 : suppression du compte admin — validée.
- Tâche 2 : `JWT_SECRET` obligatoire — validée (typage corrigé pour le build).
- Tâche 3 : URL relatives — validée (requêtes via nginx, Socket.IO inclus).
- Tâche 4 : suppression de l'ancien seed — partielle, validée. Reporté en Phase 4 : `QuizService`, `QuizListController`, `services/quiz.ts`, choix de quiz dans `HomeView.vue`.
- Base renommée `quizz`, volume recréé, `.env` unique à la racine.
- À traiter plus tard : upgrade WebSocket (Socket.IO observé en polling), test unitaire de `verifyToken` (Phase 1).

### Phase 0 — Tâche 1 : suppression du compte admin
- Statut : terminée et validée (application fonctionnelle après modification).
- Fichiers : `apps/api/src/auth.service.ts`, `apps/web/src/view/LoginView.vue`.
- Limite : un ancien compte admin peut subsister dans la base actuelle ; il sera supprimé lors du reset de la base.

### Phase 0 — Tâche 2 : JWT_SECRET obligatoire
- Statut : terminée et validée (cas nominal et cas négatif vérifiés).
- Fichiers : `apps/api/src/auth.service.ts`, `docker-compose.yml`.
- Reporté : test unitaire de `verifyToken`, à faire en Phase 1 avec Vitest.

### Phase 0 — Tâche 3 : URL relatives
- Statut : terminée et validée (requêtes via nginx sur localhost:8080, parcours inscription, connexion, salle, jointure, tchat).
- Fichiers : `services/auth.ts`, `services/room.ts`, `services/quiz.ts`, `view/RoomView.vue`.
- Note : Socket.IO observé en polling ; upgrade WebSocket à vérifier ultérieurement.
- `QuizView.vue` reste à supprimer en tâche 4.

### Phase 0 — Tâche 4 : suppression de l'ancien seed (partielle)
- Supprimés : `QuizView.vue`, `quiz.controller.ts`, `seed-quiz.ts` ; route `/quiz` et `QuizController` retirés.
- Reporté à la Phase 4 : `QuizService`, `QuizListController`, `services/quiz.ts`, choix de quiz dans `HomeView.vue`.

### Réinitialisation de la base
- Volume supprimé, base renommée `quizz`, `.env` aligné (`POSTGRES_DB` et `DATABASE_URL`). Démarrage vérifié.
- Problème rencontré : `DATABASE_URL` désalignée (erreur P1000 sur le rôle `resto`), corrigée.