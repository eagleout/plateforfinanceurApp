# Plateforme Financement — Application métier

Application web de qualification, suivi de dossier et pipeline consultant pour **plateformefinancement.fr**.

> **✅ Statut : PRODUCTION (backend Supabase)**
> L'app dispose d'une authentification réelle (email + mot de passe), d'une base
> de données partagée, d'upload de fichiers réels, du cloisonnement de sécurité
> (RLS) et du temps réel. Le front reste **statique** (déploiement GitHub Pages
> inchangé). **Configuration en 6 étapes : voir [`SETUP.md`](SETUP.md).**

---

## 🎯 Ce que fait l'app

Trois vues connectées par une base de données Supabase partagée :

### 1. Vue Prospect — qualification publique
- Arbre de décision en 8 étapes (selon l'arborescence métier validée)
- Branches : Investissement & Trésorerie/BFR
- Critères : bilan clôturé, seuils de CA (500 K€ / 800 K€ / 900 K€), résultat net, fonds propres, type de clientèle
- 4 objets de financement (Immobilier, Rachat, Matériel, Autre) + 4 solutions de trésorerie (Découvert, Dailly, Escompte, Affacturage)
- Refus *doux* avec proposition de re-qualification à 6 mois pour ne pas perdre le lead
- Création automatique du dossier client à la fin du parcours OK

### 2. Vue Client — espace prospect
- Timeline des 8 statuts du dossier
- Cartes documents avec upload (Bilan, K-bis, 3 relevés, Statuts selon le cas)
- Messagerie avec le consultant dédié
- Stats : montant, statut, % de complétude documentaire
- Avancement automatique du statut quand tous les documents sont uploadés

### 3. Vue Consultant — back-office
- Pipeline Kanban à 8 colonnes (Nouveau → Pièces → Complet → Instruction → Présenté → Offres → Closing → Gagné)
- Fiche dossier détaillée avec synthèse, pièces, notes internes
- Changement de statut depuis la modale → répercuté côté client
- Statistiques globales du pipeline

---

## 🚀 Mise en ligne — GitHub Pages

### 1. Créer le repo GitHub

1. [github.com/new](https://github.com/new)
2. Nom : `plateformefinancement-app`
3. Public (gratuit GitHub Pages)
4. Ne pas initialiser avec README
5. **Create repository**

### 2. Pousser les fichiers

Depuis ce dossier, en terminal :

```bash
git init
git add .
git commit -m "Initial commit — app prototype v1"
git branch -M main
git remote add origin https://github.com/VOTRE-USERNAME/plateformefinancement-app.git
git push -u origin main
```

### 3. Activer GitHub Pages

1. Repo GitHub → **Settings → Pages**
2. Source : `Deploy from a branch`
3. Branch : `main` / dossier `/ (root)`
4. **Save**

URL temporaire : `https://VOTRE-USERNAME.github.io/plateformefinancement-app/`

### 4. Brancher le sous-domaine `app.plateformefinancement.fr`

1. Settings → Pages → **Custom domain** : `app.plateformefinancement.fr` → Save
2. Chez votre registrar DNS, ajouter :

| Type  | Nom  | Valeur                          |
|-------|------|---------------------------------|
| CNAME | app  | `VOTRE-USERNAME.github.io.`     |

3. Attendre la propagation DNS (5 min à 24h)
4. Cocher **Enforce HTTPS** dans GitHub Pages

> Aucune entrée A à toucher — l'app vit sur un sous-domaine, la racine reste celle de la landing.

---

## 📁 Structure

```
.
├── index.html                # Structure + design (HTML/CSS)
├── assets/
│   ├── supabase-config.js    # Tes clés Supabase (URL + clé anon) — À REMPLIR
│   └── app.js                # Logique : auth, qualification, data layer, realtime
├── supabase-schema.sql       # Schéma DB + RLS + Storage (à exécuter dans Supabase)
├── SETUP.md                  # Guide de mise en production (6 étapes)
├── CNAME                     # Sous-domaine GitHub Pages
├── 404.html                  # Page erreur dans le même style
├── robots.txt                # Bloque l'indexation Google (app privée)
├── README.md                 # Ce fichier
└── .gitignore
```

---

## ✏️ Personnalisation rapide

### Tester l'app

1. Renseigne `assets/supabase-config.js` (voir [`SETUP.md`](SETUP.md)).
2. Sers le dossier en local (les `assets/*.js` ne se chargent pas via `file://`) :
   ```bash
   python3 -m http.server 8000
   # puis ouvre http://localhost:8000
   ```
3. Fais une qualification → ton compte client est créé → tu accèdes à ton espace.
4. Pour le back-office, promeus ton compte en consultant (Étape 6 de `SETUP.md`).

### Modifier l'arbre de qualification

Localise dans `assets/app.js` la constante `const tree = {`.

Chaque nœud a la forme :
```js
nom_du_noeud: {
  label: 'Étape X — Titre court',
  step: X,
  question: 'Texte de la question ?',
  hint: 'Texte d\'aide (optionnel)',
  options: [
    { label: 'Réponse 1', next: 'nom_noeud_suivant' },
    { label: 'Réponse 2', next: 'ko_nom_du_refus' }
  ]
}
```

Pour ajouter un refus :
```js
ko_mon_motif: {
  ko: true,
  title: 'Titre du refus',
  reason: 'Explication montrée au prospect.'
}
```

### Modifier les statuts du pipeline

Localise `const STATUSES = [` dans `assets/app.js`. L'ordre et les labels sont modifiables. La couleur de chaque colonne est dans `cls`.

### Modifier les pièces demandées

Localise la fonction `getRequiredDocs(scenario)` dans `assets/app.js`. Tu peux conditionner la liste selon le scénario.

---

## 🛣️ Roadmap MVP — vers la production

### Phase 1 — MVP fonctionnel ✅ **FAIT**

**Stack retenue :** front statique (GitHub Pages) + Supabase (Auth / Postgres / Storage / Realtime).
Configuration : voir [`SETUP.md`](SETUP.md).

- [x] Authentification réelle (Supabase Auth, email + mot de passe)
- [x] Base de données PostgreSQL Supabase
- [x] Upload réel des pièces (Supabase Storage, bucket privé + liens signés)
- [x] Tables : `profiles`, `deals`, `documents`, `messages`
- [x] Row Level Security : chaque client ne voit que son dossier
- [x] Notifications temps réel (Supabase Realtime) — statut & messages en live
- [x] Déploiement conservé sur GitHub Pages → `app.plateformefinancement.fr`
- [ ] Emails transactionnels (Resend) — reporté Phase 2 (nécessite une Edge Function)
- [ ] Historique des changements de statut (`status_history`) — reporté Phase 2

### Phase 2 — Productivité consultant (3-4 jours)

- [ ] Multi-utilisateurs équipe : assignation de dossiers à des consultants
- [ ] Filtres avancés du pipeline (par consultant, par montant, par âge)
- [ ] Recherche full-text dans les dossiers
- [ ] Export Excel du pipeline
- [ ] Vue calendrier des RDV à programmer
- [ ] Templates de messages réutilisables

### Phase 3 — Automatisations avancées (5-7 jours)

- [ ] Signature électronique des mandats (intégration Yousign ou DocuSign)
- [ ] Génération PDF du dossier d'instruction
- [ ] Relances automatiques quand un client n'a pas uploadé ses pièces depuis X jours
- [ ] Intégration calendrier (Calendly / Cal.com)
- [ ] Webhooks vers le CRM existant si pertinent
- [ ] Tableau de bord financier (encours pipeline, taux de transformation par segment)

### Phase 4 — Côté financeurs (optionnel)

- [ ] Portail dédié aux partenaires bancaires
- [ ] Envoi sécurisé des dossiers via portail au lieu d'emails
- [ ] Tracking des offres reçues
- [ ] Comparateur d'offres pour le client

---

## 🔒 Sécurité & RGPD (notes pour la prod)

Quand on passera en prod, les points à traiter :

- **DPA** (Data Processing Agreement) avec Supabase
- **CGU** et **politique de confidentialité** spécifiques à l'app
- **Consentement explicite** sur le traitement des données financières (catégorie sensible)
- **Droit d'accès, rectification, suppression** des données prospect
- **Durée de conservation** des dossiers KO (3 ans max suggéré)
- **Chiffrement at-rest** (Supabase le fait par défaut) + **chiffrement en transit** (HTTPS)
- **Audit trail** des accès aux dossiers par les consultants
- **Mention CNIL** sur la landing si on stocke des données sensibles

---

## 📞 Contact

Repo maintenu par OMA Services pour le client Plateforme Financement.
