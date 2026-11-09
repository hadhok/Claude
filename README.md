# NeuralCanvas

Un canvas collaboratif infini où les idées se relient toutes seules.

Chaque note que tu déposes est transformée en vecteur sémantique par une **IA qui tourne entièrement dans ton navigateur** (transformers.js, WASM/WebGPU) — aucun texte n'est jamais envoyé à un serveur IA, aucun coût d'API. À partir de ces vecteurs, l'app :

- **relie automatiquement** les idées proches sémantiquement (un trait apparaît entre deux notes liées, même écrites par des personnes différentes, même sur des navigateurs qui n'ont jamais communiqué directement)
- **fait émerger des clusters de thèmes** en direct, matérialisés par la couleur des notes
- **détecte les contradictions potentielles** entre deux idées proches mais de polarité opposée (trait rouge en pointillés)
- propose une **recherche sémantique instantanée** (cherche par le sens, pas par mot-clé exact)
- se synchronise en **temps réel** entre tous les participants d'un canvas (notes, liens, et curseurs des collaborateurs) via Supabase Realtime
- se **partage** par simple lien (bouton "Partager"), et se rouvre même **hors ligne** une fois chargé une première fois (PWA)

Construit en 7 jours dans le cadre d'une expérience d'autonomie complète.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- Supabase (Postgres, Auth par lien magique, Realtime — postgres_changes + Presence, RLS)
- `@huggingface/transformers` (embeddings on-device, modèle `all-MiniLM-L6-v2`, exécuté dans un Web Worker)
- Service worker maison pour le cache offline de l'app shell
- lucide-react

## Setup local

1. Copier `.env.example` vers `.env.local` et renseigner les clés Supabase du projet (URL, anon key, service role key).
2. Appliquer le schéma : ouvrir **Supabase → SQL Editor** et exécuter le contenu de `supabase/schema.sql` (rejouable sans risque : `create or replace`, `drop policy if exists`, `create table if not exists`).
3. Dans Supabase → Authentication → URL Configuration :
   - **Site URL** = l'URL de déploiement (ex: `https://ton-app.vercel.app`), pas `localhost` en prod
   - **Redirect URLs** : ajouter `<ton-url>/auth/callback`
4. `npm install`
5. `npm run dev`

## Utilisation

- Se connecter par lien magique
- Créer un canvas, double-cliquer dans le vide pour ajouter une idée (Entrée pour valider, Échap pour annuler)
- Glisser une note pour la déplacer, molette pour zoomer/dézoomer
- Les liens et les couleurs de cluster se dessinent automatiquement au fil des ajouts
- Bouton loupe : recherche sémantique dans les notes du canvas
- Bouton "Partager" : copie un lien d'invitation — quiconque l'ouvre (après connexion) rejoint le canvas en tant qu'éditeur

## Structure

- `src/app/canvas` — liste des canvases + vue canvas
- `src/app/join/[token]` — résolution des liens de partage (auto-enrôlement)
- `src/components/CanvasBoard.tsx` — le canvas interactif (pan/zoom, notes, liens, realtime, présence)
- `src/workers/embedding.worker.ts` — moteur d'embeddings in-browser (Web Worker, ne bloque jamais l'UI)
- `src/lib/embedding.ts` — wrapper client du worker + similarité cosinus
- `src/lib/clustering.ts` — suggestion de liens, détection de contradictions, clustering
- `src/lib/supabase/admin.ts` — client service-role serveur uniquement (résolution des liens de partage)
- `public/sw.js` — service worker de cache offline de l'app shell
- `supabase/schema.sql` — schéma DB + RLS + triggers + fonctions `security definer`

## Notes techniques

- Pas d'appel à une API IA payante : tout le raisonnement sémantique (embeddings, liens, clusters, contradictions, recherche) est calculé localement dans le navigateur de chaque utilisateur.
- Les policies RLS pour `canvases`/`canvas_members` passent par des fonctions `security definer` (`is_canvas_owner`, `is_canvas_member`, `can_access_canvas`, `can_edit_canvas`) pour éviter une récursion infinie entre les deux tables.
- La réconciliation IA (liens + clusters) est gardée par une signature de contenu (id + présence d'embedding + cluster + texte), pas par la référence brute des nodes — glisser une note ne redéclenche donc jamais ce calcul O(n²).
- La table `presence` du schéma initial n'est finalement pas utilisée : la présence live (curseurs) passe par l'API Presence native de Supabase Realtime (éphémère, sans écriture DB), plus légère.
- Le sandbox de développement n'a pas d'accès réseau sortant vers Supabase/Vercel/HuggingFace ; toute vérification en conditions réelles (RLS, déploiement, chargement du modèle IA) a été faite soit via un navigateur headless local pour les aspects testables sans réseau externe, soit en conditions réelles avec l'utilisateur.

## Limites connues

- Pas de résumé de cluster généré automatiquement (seul le regroupement visuel existe)
- Pas de gestion fine des rôles (viewer vs editor) dans l'UI — tout rejoignant devient éditeur
- Le premier chargement de l'IA télécharge le modèle (~25 Mo, mis en cache par le navigateur ensuite)
