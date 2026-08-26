# NeuralCanvas

Un canvas collaboratif infini où les idées se relient toutes seules.

Chaque note que tu déposes est transformée en vecteur sémantique par une **IA qui tourne entièrement dans ton navigateur** (transformers.js, WASM/WebGPU) — aucun texte n'est jamais envoyé à un serveur IA, aucun coût d'API. À partir de ces vecteurs, l'app :

- **relie automatiquement** les idées proches sémantiquement (un trait apparaît entre deux notes liées, même écrites par des personnes différentes)
- **fait émerger des clusters de thèmes** en direct, matérialisés par la couleur des notes
- **détecte les contradictions potentielles** entre deux idées proches mais de polarité opposée (trait rouge en pointillés)
- se synchronise en **temps réel** entre tous les participants d'un canvas via Supabase Realtime

Ce projet est développé de façon autonome sur 7 jours dans le cadre d'une expérience. Voir le suivi de progression dans les commits.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- Supabase (Postgres, Auth par lien magique, Realtime, RLS)
- `@huggingface/transformers` (embeddings on-device, modèle `all-MiniLM-L6-v2`, exécuté dans un Web Worker)
- lucide-react

## Setup local

1. Copier `.env.example` vers `.env.local` et renseigner les clés Supabase du projet (URL, anon key, service role key).
2. Appliquer le schéma : ouvrir **Supabase → SQL Editor** et exécuter le contenu de `supabase/schema.sql` (tables `canvases`, `canvas_members`, `nodes`, `edges`, `presence`, `profiles`, policies RLS, triggers).
3. Dans Supabase → Authentication → URL Configuration, ajouter `http://localhost:3000/auth/callback` (et l'URL de prod une fois déployée) aux Redirect URLs.
4. `npm install`
5. `npm run dev`

## Utilisation

- Se connecter par lien magique
- Créer un canvas, double-cliquer dans le vide pour ajouter une idée
- Glisser une note pour la déplacer, molette pour zoomer/dézoomer
- Les liens et les couleurs de cluster se dessinent automatiquement au fil des ajouts

## Structure

- `src/app/canvas` — liste des canvases + vue canvas
- `src/components/CanvasBoard.tsx` — le canvas interactif (pan/zoom, notes, liens, realtime)
- `src/workers/embedding.worker.ts` — moteur d'embeddings in-browser (Web Worker, ne bloque jamais l'UI)
- `src/lib/embedding.ts` — wrapper client du worker + similarité cosinus
- `src/lib/clustering.ts` — suggestion de liens, détection de contradictions, clustering
- `supabase/schema.sql` — schéma DB + RLS + triggers

## Notes

- Pas d'appel à une API IA payante : tout le raisonnement sémantique (embeddings, liens, clusters, contradictions) est calculé localement dans le navigateur de chaque utilisateur.
- Le sandbox de développement n'a pas d'accès réseau sortant vers Supabase ; la migration SQL doit être appliquée manuellement une fois via le SQL Editor.
