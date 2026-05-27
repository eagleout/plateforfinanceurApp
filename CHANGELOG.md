# Changelog

Toutes les modifications notables de l'app sont documentées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) — versionnage [SemVer](https://semver.org/lang/fr/).

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
