# HabitLoop

Application de suivi d'habitudes avec streaks, statistiques et insights — construite avec Next.js (App Router) et Supabase.

Ce projet est développé de façon autonome sur 7 jours dans le cadre d'une expérience. Voir le suivi de progression dans les commits.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- Supabase (Postgres, Auth par lien magique, Realtime, RLS)
- recharts, lucide-react, date-fns

## Setup local

1. Copier `.env.example` vers `.env.local` et renseigner les clés Supabase du projet (URL, anon key, service role key).
2. Appliquer le schéma : ouvrir **Supabase → SQL Editor** et exécuter le contenu de `supabase/schema.sql` (crée les tables `habits`, `habit_logs`, `profiles`, `insights`, les policies RLS et le trigger de création de profil).
3. Dans Supabase → Authentication → URL Configuration, ajouter `http://localhost:3000/auth/callback` (et l'URL de prod une fois déployée) aux Redirect URLs.
4. `npm install`
5. `npm run dev`

## Structure

- `src/app/login` — connexion par lien magique (OTP email)
- `src/app/dashboard` — liste des habitudes, streaks, ajout/suppression
- `src/app/auth` — callback OAuth + déconnexion
- `src/lib/supabase` — clients Supabase (browser / server)
- `src/lib/streaks.ts` — calcul des séries (streaks)
- `supabase/schema.sql` — schéma DB + RLS + trigger

## Notes

- Pas d'appel à une API IA payante : les insights (à venir) sont calculés localement à partir des logs d'habitudes.
- Le sandbox de développement n'a pas d'accès réseau sortant vers Supabase ; la migration SQL doit être appliquée manuellement une fois via le SQL Editor.
