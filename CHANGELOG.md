# Changelog

Toutes les modifications notables de l'app sont documentées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) — versionnage [SemVer](https://semver.org/lang/fr/).

---

## [0.2.0] — 2026-06-15

### 🚀 Passage en production — Backend Supabase

**Sortie du prototype `localStorage`. Backend réel : Auth + Postgres + Storage + Realtime.**
Le front reste statique (`index.html` + `assets/`) — déploiement GitHub Pages inchangé.

#### Ajouté

- **Authentification réelle** (Supabase Auth, email + mot de passe)
  - Inscription du prospect en fin de qualification (création de compte + dossier)
  - Modale de connexion pour les clients et consultants existants
  - Routage selon le rôle : client → son espace, consultant → back-office
- **Base de données partagée** : tables `profiles`, `deals`, `documents`, `messages`
- **Sécurité (RLS)** : un client ne lit/écrit que son dossier ; le consultant voit tout
- **Upload de fichiers réels** dans un bucket Storage privé `documents` (liens signés temporaires)
- **Messagerie temps réel** bidirectionnelle (le consultant répond depuis la fiche dossier)
- **Synchronisation temps réel** des statuts et messages entre client et consultant
- `supabase-schema.sql` (schéma + RLS + Storage + triggers) et `SETUP.md` (guide de mise en prod)
- `assets/supabase-config.js` pour les clés (clé `anon` publique uniquement)

#### Modifié

- Le sélecteur de vue « Démo » est remplacé par une vraie connexion authentifiée
- Logique applicative déplacée du `<script>` inline vers `assets/app.js`

#### Supprimé

- Persistance `localStorage` et jeux de données de démo en dur

---

## [0.1.0] — 2026-05-27

### 🎉 Version initiale — Prototype

**Architecture monofichier HTML/CSS/JS — localStorage pour persistance.**

#### Ajouté

- **Vue Prospect** : arbre de qualification en 8 étapes
  - Branche Investissement (immobilier, rachat, matériel, autre)
  - Branche Trésorerie/BFR avec sous-branches (avec/sans bilan, B2B/B2C, avec/sans lignes existantes)
  - Solutions de trésorerie (découvert, Dailly, escompte, affacturage)
  - 8 cas de refus avec messages contextuels et proposition de re-qualification à 6 mois
- **Vue Client** : espace de suivi prospect
  - Timeline des 8 statuts du dossier
  - Upload de pièces avec types conditionnels selon le scénario
  - Messagerie avec le consultant
  - Avancement automatique du statut quand toutes les pièces sont uploadées
- **Vue Consultant** : back-office
  - Pipeline Kanban à 8 colonnes
  - Fiche dossier en modale avec synthèse, pièces, notes
  - Changement de statut avec répercussion temps réel sur la vue client
  - Statistiques globales du pipeline
- **Bouton de démo** en overlay pour switcher entre les 3 vues
- 7 dossiers fictifs pré-chargés pour la démo back-office
- Design system cohérent : palette bleu nuit + doré, typographie Fraunces + Manrope
- Page 404 dans le même style

### À venir (roadmap MVP — voir README)

- Authentification réelle (Supabase Auth, magic link)
- Backend Next.js + base PostgreSQL Supabase
- Upload réel sur Supabase Storage
- Emails transactionnels (Resend)
- Notifications temps réel (Supabase Realtime)
- Multi-utilisateurs équipe consultant
