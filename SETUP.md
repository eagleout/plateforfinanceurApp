# Mise en production — Plateforme Financement

L'app est passée du prototype `localStorage` à une **vraie application** avec
backend Supabase : comptes, base de données partagée, upload de fichiers réels,
cloisonnement de sécurité (un client ne voit que SON dossier) et temps réel.

Le front reste **statique** (un seul `index.html` + `assets/`) → déploiement
GitHub Pages inchangé, domaine `app.plateformefinancement.fr` conservé.

---

## Étape 1 — Créer le projet Supabase (gratuit)

1. Va sur [supabase.com](https://supabase.com) → **New project**.
2. Nom : `plateforme-financement`. Choisis une région **Europe (eu-west)**.
3. Note bien le **mot de passe de la base** (tu n'en auras pas besoin pour l'app,
   mais garde-le).
4. Attends ~2 min que le projet se provisionne.

## Étape 2 — Récupérer les clés

Dans Supabase → **Project Settings** (roue crantée) → **API** :

- **Project URL** → ex. `https://abcd1234.supabase.co`
- **Project API keys → `anon` `public`** → une longue clé `eyJhbGci…`

> La clé `anon` est **publique**, elle peut figurer dans le code front.
> Ne copie **jamais** la clé `service_role` dans le code.

## Étape 3 — Brancher les clés dans l'app

Ouvre `assets/supabase-config.js` et remplace les deux valeurs :

```js
window.SUPABASE_URL      = 'https://abcd1234.supabase.co';   // ton Project URL
window.SUPABASE_ANON_KEY = 'eyJhbGci…';                      // ta clé anon public
```

## Étape 4 — Créer les tables et la sécurité

1. Supabase → **SQL Editor** → **New query**.
2. Copie **tout** le contenu de `supabase-schema.sql`, colle-le, clique **Run**.
3. Tu dois voir « Success ». Cela crée les tables `profiles`, `deals`,
   `documents`, `messages`, les règles de sécurité (RLS) et le bucket de fichiers.

## Étape 5 — Désactiver la confirmation d'email (accès immédiat)

Pour que le prospect accède à son espace dès la fin de la qualification :

Supabase → **Authentication** → **Providers** → **Email** →
décoche **« Confirm email »** → **Save**.

> Si tu préfères garder la confirmation par email, l'app affiche alors un
> message invitant le prospect à confirmer son email avant de se connecter.

## Étape 6 — Créer ton compte consultant (back-office)

1. Lance l'app, fais une qualification jusqu'au bout avec **ton** email pro pour
   créer un compte (ou Supabase → **Authentication → Users → Add user**).
2. Promeus ce compte en consultant : Supabase → **SQL Editor**, exécute
   (en remplaçant l'email) :

```sql
update public.profiles set role = 'consultant'
where id = (select id from auth.users where email = 'toi@plateformefinancement.fr');
```

3. Déconnecte-toi puis reconnecte-toi via **« Connexion à mon espace »** :
   tu arrives directement sur le **pipeline consultant**.

---

## Comment ça marche maintenant

| Rôle        | Accès                                                                 |
|-------------|-----------------------------------------------------------------------|
| **Prospect**| Page d'accueil + qualification. À la fin, crée un compte (email + mdp).|
| **Client**  | Connexion → son espace : timeline, upload de pièces réelles, messagerie.|
| **Consultant** | Connexion → pipeline Kanban de tous les dossiers, fiche, statut, réponse, notes. |

- **Sécurité (RLS)** : un client ne peut lire/écrire que son propre dossier ;
  le consultant voit tout. Appliqué côté base, pas seulement côté écran.
- **Fichiers** : stockés dans le bucket privé `documents`. Liens signés
  temporaires (120 s) à l'ouverture.
- **Temps réel** : messages et changements de statut se synchronisent
  automatiquement entre le client et le consultant.

## Déploiement

Rien ne change : `git push` sur la branche `main` → GitHub Pages publie sur
`app.plateformefinancement.fr`. Vérifie juste que `assets/supabase-config.js`
contient bien tes clés **avant** de pousser.

## Dépannage

- **« Configuration Supabase manquante »** → `assets/supabase-config.js` n'a pas
  été rempli (il contient encore `VOTRE-PROJET`).
- **L'inscription ne donne pas accès** → la confirmation d'email est encore
  activée (Étape 5).
- **Le consultant voit l'espace client** → son `profiles.role` n'est pas
  `consultant` (Étape 6).
- **Upload refusé** → vérifie que le bucket `documents` existe (créé par le SQL).
