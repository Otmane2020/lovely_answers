# Plan Shopify complet (1→6)

## 1. Contexte boutique Shopify injecté dans toutes les générations (GEO, AEO, SEO, Shopping)

Objectif : quand un projet vient d'une install OAuth Shopify, toutes les IA doivent utiliser la langue des produits, les descriptions, les pages Shopify, le nom + l'adresse de la boutique, et insérer des liens vers les produits Shopify.

- Nouvelle edge function `shopify-fetch-context` : appelle `/admin/api/2025-01/shop.json`, `/pages.json`, `/products.json?fields=title,handle,body_html,product_type` via l'API Admin Shopify (REST, `X-Shopify-Access-Token`).
- Étend `generation_settings` avec 3 colonnes JSON : `shopify_shop_info` (name, address, currency, primary_locale), `shopify_pages` (title, handle, body_html), `shopify_products_index` (title, handle, url, category, description).
- Appelée automatiquement depuis `shopify-oauth-callback` juste après l'import produits, et re-synchronisée depuis `stripe-webhook` après paiement.
- Mise à jour des prompts dans `generate-aeo-answers`, `generate-aeo-article`, `generate-geo-content`, `generate-product-ai`, `auto-generate-shopping` : lecture de ces colonnes et injection dans le system prompt (langue forcée = `primary_locale`, contexte boutique, liste des produits + URLs pour maillage interne).

## 2. Onboarding post-paiement pour clients Shopify

Objectif : les clients OAuth arrivent sur `/checkout` sans avoir rempli le wizard classique. Après paiement, ils doivent être guidés dans `/wizard`.

- Dans `stripe-webhook` (branche `checkout.session.completed`) : si `shopify_installs` existe pour l'user et que `generation_settings.onboarding_completed = false`, écrire un flag `needs_onboarding = true` sur le projet.
- Modifier la redirection après paiement (`app/thank-you/page.tsx` + `src/views/ThankYou.tsx`) : si `needs_onboarding` → `/wizard?source=shopify`.
- `src/views/AeoWizard.tsx` : quand `?source=shopify`, pré-remplir le wizard depuis `shopify_shop_info` + `shopify_products_index` (langue, nom boutique, catégories, URL) et sauter les étapes déjà connues.

## 3. Section « GEO Shopping for Shopify » sur la landing

- Nouveau composant `src/components/landing/ShopifyIntegrationSection.tsx` : logo Shopify officiel (SVG), pitch OAuth 1-clic (import auto produits, génération AEO/GEO multilingue, publication auto articles Shopify, planning 30j), CTA `Installer sur Shopify` → `/functions/v1/shopify-oauth-install?shop=`.
- Inséré dans `src/views/Index.tsx` juste après `ShoppingVisibilitySection`.
- Copy en anglais (règle mémoire : UI strictement EN).

## 4. Fix AEO generation shopping + planning

Symptômes constatés dans le code :
- `fill-shopping-planning` exige des produits avec `ai_title NOT NULL` — si `generate-product-ai` échoue silencieusement (parsing JSON tronqué, cf. Lovable stack overflow), le planning est vide.
- `auto-generate-shopping` chaîne les 2 en série sans vérifier le retour.

Corrections :
- `generate-product-ai` : passer à `max_tokens: 8192`, ajouter extraction JSON robuste (strip markdown, repair trailing commas), retry 1× si truncation détectée, logger le nombre de produits effectivement traités.
- `auto-generate-shopping` : ne plus déclencher `fill-shopping-planning` si `generated === 0` ; retourner une erreur claire.
- Ajouter un bouton diagnostic dans `src/views/ShoppingPlanning.tsx` qui appelle une nouvelle route `debug-shopping-status` (compte produits imported/AI-generated/planned).

## 5. Fix publication articles Shopify

Utiliser l'**API Shopify Admin standard** (REST `/admin/api/2025-01/articles.json` via un blog par défaut) plutôt que passer par `cms-publish` générique.

- Nouvelle fonction `shopify-publish-article` :
  1. Lit `integrations.config.shop + access_token` pour le projet.
  2. GET `/admin/api/2025-01/blogs.json`, prend le premier blog (crée `News` si aucun).
  3. POST `/admin/api/2025-01/blogs/{blog_id}/articles.json` avec `{article: {title, body_html, tags, published: true, handle}}`.
- `publish-shopping-products` : si `integration.platform === 'shopify'`, appelle `shopify-publish-article` au lieu de `cms-publish`.
- `cms-publish` : ajouter aussi une branche `platform === 'shopify'` qui délègue à cette même fonction (pour la publication d'articles AEO/GEO/blog, pas seulement shopping).

## 6. Vérification vidéos + lien app dans landing

- Vérifier `src/components/landing/AIDemoSection.tsx` et refs des `.mp4.asset.json` : contrôler que les URLs résolues sont bien accessibles (HEAD 200), corriger poster/fallback si besoin.
- Ajouter dans le header + hero de `src/views/Index.tsx` un CTA `Open App` → `/dashboard` (visible pour tous, `/auth` si non connecté grâce à ProtectedRoute).

## Détails techniques

**Ordre d'exécution des edits** (pour éviter les régressions) :
1. Migration DB (colonnes `generation_settings` + `projects.needs_onboarding`)
2. `shopify-fetch-context` + hook dans `shopify-oauth-callback`
3. `shopify-publish-article` + wire dans `publish-shopping-products` et `cms-publish`
4. Patch prompts des 5 fonctions IA
5. Patch `generate-product-ai` (robustesse JSON + tokens)
6. `stripe-webhook` : flag + re-sync context
7. `ThankYou` + `AeoWizard` : redirection + préremplissage
8. `ShopifyIntegrationSection` + insertion Index
9. Vérif vidéos + bouton Open App

**Fichiers créés** :
- `supabase/functions/shopify-fetch-context/index.ts`
- `supabase/functions/shopify-publish-article/index.ts`
- `supabase/functions/debug-shopping-status/index.ts`
- `src/components/landing/ShopifyIntegrationSection.tsx`
- 1 migration SQL

**Fichiers modifiés** : ~10 (edge functions IA, webhook, wizard, thank-you, index).

**Secrets requis** : aucun nouveau — `SHOPIFY_ACCESS_TOKEN` (secret client Shopify) déjà présent, chaque install a son propre token stocké dans `shopify_installs.access_token`.
