# Mirage Pulso

Dashboard en vivo de las experiencias Mirage (Catálogo + Memory Match, Colombia y México). Sitio estático, sin build: `index.html` + `style.css` + `app.js`, que leen directo de Supabase con la publishable key (la misma que ya usan las otras 4 apps del evento).

## Cómo correrlo local

```
npx serve .
```

O simplemente abrir `index.html` en el navegador (usa rutas relativas solo para `style.css`/`app.js`, el resto es todo `fetch` a Supabase).

## Desplegar en Netlify

No necesita build: `netlify.toml` ya tiene `publish = "."` y `command = ""`. Basta con conectar el repo de GitHub a un nuevo site en Netlify (Import from Git) - no hace falta configurar nada más.

## Qué datos muestra y de dónde salen

Todo se lee en vivo con la **publishable key** de Supabase (público por diseño, protegido por RLS - nunca expone nombre/email más allá de lo que ya es público en los Top 5 de las tablets/totems):

- `ranking_by_experience` / `ranking_combined`: nombre + puntaje por experiencia y el ranking general por día.
- `registrations_counts`: cuántos códigos se registraron por país (sin nombre/email).
- `participations_anonymous_counts`: cuántos jugaron con "Continúa sin registro", por país y día.
- `product_view_counts`: qué productos del catálogo se vieron más, por país.

Estas tres últimas vistas se crearon específicamente para este dashboard (no las usa ninguna otra app) - son agregados de solo conteo, nunca exponen datos personales.

## El botón "Actualizar"

A diferencia de la versión anterior (un Artifact de Claude), este sitio SÍ puede hacer `fetch` en vivo a Supabase sin restricciones - así que "Actualizar" trae datos reales al tocarlo, y la página también se actualiza sola al cargar.
