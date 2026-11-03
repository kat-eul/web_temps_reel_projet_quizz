# MVP — Application de quiz multijoueur en temps réel

## 1. Objectif du projet

Développer une application web de quiz multijoueur permettant à plusieurs utilisateurs de participer à une partie en temps réel.

L'application doit permettre de créer des salles, de rejoindre une partie, de répondre aux questions simultanément et de consulter les scores et classements en direct.

## 2. Technologies imposées

| Partie | Technologie |
|---|---|
| Frontend | Vue.js |
| Backend | NestJS |
| Base de données | PostgreSQL |
| ORM | Prisma |
| Communication temps réel | Socket.IO |
| Validation des données | Zod |
| Conteneurisation | Docker |
| Orchestration locale | Docker Compose |

## 3. Gestion des utilisateurs

### Inscription et connexion
- Création d'un compte utilisateur.
- Connexion et déconnexion.
- Gestion sécurisée des mots de passe.
- Gestion des sessions ou des jetons d'authentification.

### Rôles
- **Administrateur** : gère les quiz, les questions et les utilisateurs.
- **Utilisateur** : participe aux quiz et peut créer des salles.
- **Créateur de salle (hôte)** : organise une partie et gère les participants.

## 4. Gestion des quiz — Administrateur

Seuls les administrateurs peuvent créer et gérer les quiz.

Dans le MVP, la partie création d'un quiz ne sera pas implémentée. 
Un quiz doit etre pré-créé dans la base de données et composer de 2 questions à choix multiples (QCM) avec 4 réponses possibles, dont une seule est correcte.

## 5. Gestion des salles

### Création d'une salle
Un utilisateur connecté peut :
- Créer une salle de jeu.
- Sélectionner un quiz existant.
- Devenir automatiquement l'hôte de la salle.
- Ouvrir la salle aux autres participants.

### Découverte des salles
- Afficher les salles publiques disponibles.
- Afficher le nombre de participants.
- Afficher le quiz sélectionné.
- Permettre aux utilisateurs de demander à rejoindre une salle.

### Gestion des participants
L'hôte peut :
- Accepter une demande de participation.
- Refuser une demande de participation.
- Consulter la liste des participants.
- Lancer la partie lorsque les conditions nécessaires sont réunies.

Les participants peuvent :
- Rejoindre une salle.
- Signaler qu'ils sont prêts.
- Quitter une salle.

## 6. Salle d'attente

Chaque salle possède un espace d'attente avant le lancement du quiz.

Fonctionnalités :
- Afficher les participants présents.
- Afficher leur statut (prêt ou non prêt).
- Permettre aux participants de changer leur statut.
- Permettre à l'hôte de gérer les demandes d'accès.
- Proposer un chat textuel entre les participants (en temps réel).
- Permettre à l'hôte de lancer la partie.

## 7. Déroulement du quiz en temps réel

La communication entre les participants et le serveur utilise Socket.IO.

Fonctionnalités :
- Synchroniser le lancement de la partie.
- Afficher simultanément la même question à tous les participants.
- Afficher les propositions de réponses.
- Permettre aux participants de soumettre leurs réponses.
- Gérer le temps disponible pour répondre.
- Passer automatiquement à la question suivante lorsque le temps est écoulé.
- Synchroniser l'état de la partie pour tous les participants.

Le serveur doit rester responsable de l'état de la partie, du temps officiel et de la validation des réponses.

## 8. Système de points et classement

Le système doit calculer automatiquement les scores des participants.

Fonctionnalités :
- Vérifier les réponses.
- Calculer les points obtenus.
- Prendre en compte la rapidité de réponse selon les règles de scoring retenues.
- Afficher les scores des participants.
- Mettre à jour le classement en temps réel.
- Afficher le classement final à la fin du quiz.

## 9. Résultats

À la fin de la partie :
- Afficher le score de chaque participant.
- Afficher les bonnes réponses.
- Afficher le classement général.
- Mettre en évidence la position de l'utilisateur connecté.
- Permettre à l'hôte de consulter les résultats de tous les participants.

## 11. Interface utilisateur

L'application doit proposer une interface :
- Simple et intuitive.
- Responsive (ordinateur, tablette et mobile).
- Adaptée à une utilisation en temps réel.
- Avec des retours visuels clairs sur les actions des utilisateurs.

Les principales pages sont :
1. Inscription et connexion.
2. Tableau de bord.
3. Liste des salles publiques.
4. Création d'une salle.
5. Salle d'attente.
6. Interface de jeu.
7. Résultats et classement.
8. Administration des quiz et des utilisateurs.

## 12. Sécurité et validation

- Valider toutes les données reçues par le backend avec Zod.
- Vérifier les permissions selon le rôle de l'utilisateur.
- Protéger les routes et les événements Socket.IO.
- Sécuriser les mots de passe.
- Empêcher un utilisateur de modifier son score.
- Ne jamais transmettre les réponses correctes avant le moment prévu.
- Empêcher les soumissions multiples pour une même question.
- Vérifier côté serveur que les utilisateurs ont bien accès à la salle concernée.

## 13. Architecture du projet

Structure souhaitée :

```text
project/
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── ...
│
├── backend/
│   ├── src/
│   ├── prisma/
│   └── ...
│
├── package.json
├── docker-compose.yml
└── README.md
```

Les schémas Zod partagés entre le frontend et le backend devront être organisés dans un module commun, afin d'éviter la duplication des règles de validation.
L'ensemble du projet sera conteneurisé avec Docker et orchestré localement avec Docker Compose.

## 14. Fonctionnalités hors MVP

Les fonctionnalités suivantes pourront être ajoutées dans des versions ultérieures :

- Historique des parties jouées.
- Gestion des quiz par les administrateurs (création, modification, suppression).
- Tournois et compétitions.
- Création d'équipes.
- Salles privées.
- Invitations par lien ou code.
- Statistiques avancées.
- Personnalisation poussée des quiz.
- Système de récompenses et de badges.
- Classements globaux entre utilisateurs.
- Reconnexion automatique à une partie après une déconnexion.

## 15. Critères de réussite du MVP

Le MVP sera considéré comme fonctionnel lorsque :

- Un utilisateur peut créer un compte et se connecter - OK
- Un administrateur a accès à une page des gestion des quizz. Il ne visualise pour l'instant que les quizz pré-créés dans la base de données.
- Un utilisateur peut créer une salle publique.
- Les autres utilisateurs peuvent découvrir et demander à rejoindre cette salle.
- L'hôte peut accepter ou refuser les participants.
- Les participants peuvent indiquer qu'ils sont prêts.
- L'hôte peut lancer une partie.
- Tous les participants reçoivent les questions en temps réel.
- Les réponses sont validées côté serveur.
- Les scores sont calculés automatiquement.
- Le classement est mis à jour selon les règles définies.
- Les résultats finaux sont accessibles à tous les participants.
- Chaque utilisateur peut consulter son historique.

---

**Objectif final :** obtenir une première version stable, sécurisée et fonctionnelle d'une plateforme de quiz multijoueur en temps réel, construite sur Vue.js, NestJS, PostgreSQL, Prisma et Socket.IO.