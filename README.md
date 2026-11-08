# wbso-tool

MijnArnoud: interne WBSO-tool in de huisstijl van MijnWBSO (Cloudflare Worker), zelfde opzet als exact-mcp.

- `worker.js` – inloggen met sleutel, en `/api/generate` voor de aanvraagteksten (Claude)
- `public/index.html` – de tool (stap 1 t/m 9)
- `public/forms/` – de lege offline RVO-projectformulieren (v1.9) die de tool invult
- `wrangler.toml` – Cloudflare-instellingen

Geheimen staan alleen in Cloudflare (Settings > Variables and Secrets): `APP_SECRET`, `ANTHROPIC_API_KEY`. Optioneel de variabele `MODEL`.
Elke push naar `main` wordt automatisch door Cloudflare gedeployed.

Let op: ingevulde gegevens worden bewaard in de browser (localStorage) van de gebruiker, per apparaat.
