// WBSO-tool (MijnArnoud) – Cloudflare Worker
//
// Instellingen in Cloudflare (Settings > Variables and Secrets):
//   APP_SECRET         (secret)  - zelfgekozen lange willekeurige sleutel (min. 32 tekens) om de tool te openen
//   ANTHROPIC_API_KEY  (secret)  - API-sleutel van console.anthropic.com, voor "Verwerk tot aanvraagtekst"
//   MODEL              (variabele, optioneel) - bijv. claude-sonnet-5-5 (standaard) of claude-opus-5-5
//
// Routes:
//   /            - de tool (na inloggen met APP_SECRET)
//   /login       - inlogscherm
//   /logout      - uitloggen
//   /api/generate- tekst laten schrijven door Claude (alleen na inloggen)

const COOKIE = "wbso_sessie";

function checkConfig(env) {
  const missing = ["APP_SECRET", "ANTHROPIC_API_KEY"].filter((k) => !env[k]);
  if (env.APP_SECRET && env.APP_SECRET.length < 32) missing.push("APP_SECRET (minimaal 32 tekens)");
  return missing;
}
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function sessionToken(env) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("wbso-tool-sessie-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function getCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  const m = c.split(/;\s*/).find((x) => x.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
}
const SEC = { "x-frame-options": "DENY", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...SEC, ...extra } });
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...SEC } });

const LOGIN_HTML = (fout) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MijnArnoud – inloggen</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600&display=swap">
<style>body{margin:0;font-family:"Hanken Grotesk",Arial,sans-serif;background:#F5F0E6;color:#363E4C;display:grid;place-items:center;min-height:100vh}
.c{background:#fff;border:1px solid #D9DDE4;border-radius:14px;padding:28px;width:min(420px,92vw);display:grid;gap:14px;box-shadow:0 8px 30px rgba(12,26,49,.08)}
h1{margin:0;font-size:22px;color:#0C1A31}label{font-size:13px;font-weight:600;color:#0C1A31}input{font:inherit;padding:10px 12px;border:1px solid #D9DDE4;border-radius:8px;width:100%;box-sizing:border-box}
button{font:inherit;font-weight:600;background:#377132;color:#fff;border:0;border-radius:8px;padding:11px;cursor:pointer}.f{color:#9A2B1F;font-size:13px}</style></head>
<body><form class="c" method="post" action="/login"><h1>MijnArnoud</h1><p style="margin:0">Interne WBSO-tool. Log in met de sleutel.</p>${fout ? '<div class="f">Onjuiste sleutel.</div>' : ""}
<label for="k">Sleutel</label><input id="k" name="key" type="password" autocomplete="current-password" required autofocus><button type="submit">Openen</button></form></body></html>`;

async function handleGenerate(request, env) {
  if (request.method !== "POST") return json({ error: "Alleen POST" }, 405);
  let body; try { body = await request.json(); } catch { return json({ error: "Ongeldige aanvraag", code: "invalid_request" }, 400); }
  const prompt = String(body.prompt || "");
  if (!prompt || prompt.length > 200000) return json({ error: "Lege of te lange prompt", code: "invalid_request" }, 400);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL || "claude-sonnet-5-5", max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = r.status === 429 ? "rate_limited" : r.status === 401 ? "sampling_disabled" : "upstream_error";
    return json({ error: (j.error && j.error.message) || "Fout bij Claude", code }, r.status === 429 ? 429 : 502);
  }
  const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  if (!text.trim()) return json({ error: "Leeg antwoord", code: "empty_completion" }, 502);
  return json({ text, truncated: j.stop_reason === "max_tokens" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const missing = checkConfig(env);
    if (missing.length) return html(`<h2>Instellingen ontbreken</h2><p>Vul in Cloudflare in: ${missing.join(", ")}</p>`, 500);

    if (url.pathname === "/login") {
      if (request.method === "POST") {
        const form = await request.formData();
        if (!safeEqual(form.get("key"), env.APP_SECRET)) return html(LOGIN_HTML(true), 401);
        const tok = await sessionToken(env);
        return new Response(null, { status: 303, headers: { location: "/", "set-cookie": `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000` } });
      }
      return html(LOGIN_HTML(false));
    }
    if (url.pathname === "/logout") return new Response(null, { status: 303, headers: { location: "/login", "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` } });

    const ok = safeEqual(getCookie(request, COOKIE), await sessionToken(env));
    if (!ok) return url.pathname.startsWith("/api/") ? json({ error: "Niet ingelogd", code: "session_expired" }, 401) : Response.redirect(url.origin + "/login", 303);

    if (url.pathname === "/api/generate") return handleGenerate(request, env);
    const res = await env.ASSETS.fetch(request);
    const h = new Headers(res.headers); Object.entries(SEC).forEach(([k, v]) => h.set(k, v));
    return new Response(res.body, { status: res.status, headers: h });
  },
};
