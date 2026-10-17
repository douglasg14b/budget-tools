# infra — Budget Tools' Cloudflare edge

Pulumi TypeScript for the public path to the web app. Modelled on Fettra's `infra/` (same tunnel pattern, same
state backend), with one hostname instead of two, and Cloudflare Access in front of it.

It declares these and nothing else:

1. A remotely-managed Cloudflare Tunnel (`configSrc: cloudflare`) for the home origin.
2. Its ingress rules, in evaluation order: `budget.moochermedia.co` → `https://web:8443`, then the required
   `http_status:404` catch-all. The hostname rule sets `noTlsVerify`, because nginx's certificate is self-signed
   per boot. It also sets `access.required`, so cloudflared itself rejects any request without a valid Access token
   for this application.
3. `budget` as a proxied CNAME to `<tunnel-id>.cfargotunnel.com`.
4. A One-time PIN login method for Access.
5. An Access policy allowing the email addresses in `accessAllowedEmails`.
6. An Access application on `budget.moochermedia.co` using that policy and that login method, with a 30-day
   session. The session length is set on the application only. A policy-level duration would override it.

All six are `protect: true`. Together they are the whole public path to the origin. Because cloudflared requires
the Access token, deleting the Access application, its policy, or its login method also takes the hostname offline.

The edge rules in front of the hostname (a North America geo-block and a login rate limit) are **not** in this
program. They are added by hand in the dashboard; see [Edge rules, by hand](#edge-rules-by-hand).

### Why one hostname

The SPA and the API are already same-origin. The web client's API base URL is a hardcoded relative `/api`
(`apps/web/src/configureApiClient.ts`), and nginx proxies it to `api` over the compose network. So the tunnel routes
only to `web`. `api` gets no ingress rule, there is no CORS allow-list, and no API URL is baked into the bundle.
The session cookie (`HttpOnly; Secure; SameSite=Lax`) works unchanged, because the browser sees HTTPS at the edge.

### Cloudflare Access: a gate, not the app's login

Access stops anyone who is not on the allow-list at Cloudflare's edge. They get Cloudflare's login page, which
emails a one-time PIN to the address they enter. Only the allowed addresses can complete it. Nothing reaches the
tunnel, nginx, or the API until they do. Past Access, the app still asks for its own username and password. The
two are **independent factors**: the app neither reads nor trusts the Access identity, and its sessions are
unchanged (see `docs/auth-flow.md`).

Two Access sessions matter, and both are long:

| Session | Length | When it lapses |
| --- | --- | --- |
| Access (`CF_Authorization` cookie) | 30 days | Cloudflare's PIN page, then straight back into the app |
| App (`budget_tools_session` cookie) | 90 days, sliding | The app's own login page |

When the Access session lapses in an open tab, the app's API calls get a `401` from Access. They carry
`X-Requested-With`, which makes Access answer with a 401 instead of a redirect. The web client tells that 401
apart from the API's own: every API response carries `X-Budget-Tools-Api`, and Access's does not. The client then
navigates to `/api/auth/reauth`, a path the PWA's service worker does not intercept. Access sends that navigation
through its login page, and nginx redirects it home. See `apps/web/src/auth/edgeSession.ts`.

The LAN path never sees Access. Router DNS sends LAN clients to Caddy, so at home there is only the app's login.

### HTTPS only, enforced by the app too

The edge's Always Use HTTPS and Caddy both redirect plain HTTP before it reaches the origin. The `web` container
does not rely on that. nginx reads the scheme the browser actually used, from `CF-Visitor` (set by Cloudflare) and
`X-Forwarded-Proto` (set by Cloudflare and by Caddy), and answers `403` if either says `http`. No header at all means
a direct hit on the TLS port, such as a health check. The rule is in `apps/web/nginx.conf`.

Every listener behind that is TLS-only as well. nginx listens on `8443 ssl` and answers plain HTTP there with a
`400`. The API image sets `API_TLS_ENABLED=true`. cloudflared reaches nginx over `https://`.

### Edge caching

No cache rules are declared; Cloudflare's defaults apply. Those cache only by file extension. That covers the
bundle's `/assets/*` (content-hashed, already `immutable`), and the `no-cache` headers on `index.html`, `sw.js`, and
the manifest are respected. Every `/api/` response carries `Cache-Control: private, no-store` from nginx
(`apps/web/nginx.conf`), so one user's financial data is never stored at the edge, even if a route ever acquires a
file-like path.

## What this does not manage

- **Every other record in `moochermedia.co`.** The zone is already on Cloudflare and serves other things. This
  program only adds `budget`. Adding the rest would put live DNS at the mercy of a `pulumi up`.
- **WAF custom rules and rate limiting rules.** The zone already has hand-made firewall rules. Each of those phases
  is a single zone-wide entrypoint ruleset, so declaring one here would make Pulumi the owner of every rule in it,
  including rules for the zone's other hostnames, and a `pulumi up` would replace them. Keep rules in the dashboard.
  Do not add a `Ruleset` resource for `http_request_firewall_custom` or `http_ratelimit` to this program.
- **The Zero Trust organization** (the `<team>.cloudflareaccess.com` login domain). It is created once by hand. This
  program reads it (`getZeroTrustOrganization`) to get the team name, so `pulumi preview` fails if it does not exist.
- **The LAN path.** Caddy (outside this repo) still fronts `web` on `WEB_PORT`, and router DNS keeps LAN clients on
  it. Nothing changes for them. It is also the fallback if Cloudflare or the tunnel is down.

## Config the operator must supply

`moochermedia.co` is already on Cloudflare, so there is no nameserver move. Per stack:

```bash
cd infra
pulumi stack init prod                                   # or `pulumi stack select prod`
pulumi config set --secret cloudflare:apiToken <token>   # secret
pulumi config set accountId <cloudflare-account-id>
pulumi config set zoneId <zone-id-for-moochermedia.co>
pulumi config set --secret --path 'accessAllowedEmails[0]' <first-email>
pulumi config set --secret --path 'accessAllowedEmails[1]' <second-email>
```

Then commit `infra/Pulumi.prod.yaml`; see [Why stack config is committed](#why-stack-config-is-committed).

| Key | Kind | Value |
| --- | --- | --- |
| `cloudflare:apiToken` | secret | Scoped API token; see permissions below |
| `accountId` | config | Cloudflare account id that owns the tunnel |
| `zoneId` | config | Zone id for `moochermedia.co` |
| `accessAllowedEmails` | secret list | Who Access lets through. Secret, so no address is plaintext in the repo |

To change who is allowed, edit the list (`pulumi config set --secret --path 'accessAllowedEmails[N]' …`, or
`pulumi config rm --path 'accessAllowedEmails[N]'`) and `pulumi up`. Removing someone does not end an Access session
they already have. Revoke it in Zero Trust → My Team → Users as well.

The token needs these permissions:

- **Account → Cloudflare Tunnel → Edit**: create and configure the tunnel
- **Account → Access: Apps and Policies → Edit**: the Access application and its policy
- **Account → Access: Organizations, Identity Providers, and Groups → Edit**: the One-time PIN login method, and
  reading the organization for its team name
- **Zone → DNS → Edit** on `moochermedia.co`: publish the `budget` record

The Access permission names are as Cloudflare's token UI showed them when this was written. If they have been
renamed, pick the matching ones there; do not widen the token to make an error go away.

No WAF permission. Leaving it off means this token *cannot* touch the zone's firewall rules, so a future edit here
that adds a `Ruleset` fails instead of clobbering them. Do not work around a `403` by widening the token to
Zone → Zone → Edit. Do not reuse this token anywhere in the running app.

## Before the first `pulumi up`

Do these first, so the hostname is never public without them.

1. **Create the Zero Trust organization.** Open Zero Trust in the Cloudflare dashboard, choose a team name (it
   becomes `<team>.cloudflareaccess.com`), and pick the Free plan. It covers up to 50 users, though onboarding may
   ask for a payment method anyway. Do **not** add a login method by hand; Pulumi adds One-time PIN. An account
   can hold only one One-time PIN method. If onboarding added one already (Settings → Authentication → Login
   methods), delete it there before `pulumi up`. If another Access application uses it and it must stay, take
   `access-one-time-pin` out of `index.ts`, drop `allowedIdps` and `autoRedirectToIdentity` from the application,
   and leave the method hand-managed. Do not count on `pulumi import` into a protected resource. That path is
   untested here, and a mismatch makes `up` try to replace a resource it is forbidden to delete.
2. **No existing `budget` record** in the zone's DNS (dashboard → DNS → Records, filter `budget`). It is expected to
   be absent, since the name only resolves through router DNS today. If it exists, the CNAME create fails.
3. **SSL/TLS → Edge Certificates → Always Use HTTPS is on** for the zone. With it, `http://` visits get a `301` to
   `https://` at the edge. Without it they reach the app and get a bare `403` (see
   [HTTPS only](#https-only-enforced-by-the-app-too)), which is safe but unfriendly. It is a zone-wide setting.
4. **The two edge rules below exist** in the dashboard.

Record what you found here once checked, as Fettra does for `fettra.social`.

## Edge rules, by hand

Both live in the dashboard under the `moochermedia.co` zone, alongside the zone's existing rules. Keep the
expressions here in step with what is in the dashboard. This file is their only record.

### Geo-block: North America only

**Security → WAF → Custom rules → Create rule**

| Field | Value |
| --- | --- |
| Rule name | `budget: North America only` |
| Expression (Edit expression) | `(http.host eq "budget.moochermedia.co" and not ip.src.continent in {"NA"})` |
| Action | Block |

Scoped to the one hostname, so the zone's other hostnames are unaffected. `NA` covers the US, Canada, Mexico,
Central America, and the Caribbean. Everything else is blocked, Tor (`T1`) included. Rules run top to bottom, so
place it above any existing rule whose action is **Skip** and which could match this hostname, or that rule would
let traffic past it. Travel outside NA means using the LAN path over a VPN, or temporarily disabling the rule.

### Login rate limit

**Security → WAF → Rate limiting rules → Create rule**

| Field | Value |
| --- | --- |
| Rule name | `budget: login rate limit` |
| Expression (Edit expression) | `(http.request.uri.path eq "/api/auth/login")` |
| With the same characteristics | IP (Free adds data centre automatically) |
| When rate exceeds | 5 requests per 10 seconds |
| Then take action | Block |
| For duration | 10 seconds |

The path is where nginx proxies the API's login route (`apps/api/src/features/auth`). If that route moves, this
rule silently stops matching. With Access in front, only people who already passed Access can reach the app's
login, so this is a backstop rather than the main defence. It is cheap, so keep it.

The Free plan shapes this rule. It allows **one** rate limiting rule per zone. If the zone's slot is already
taken, choose between them, or upgrade. It also allows only a 10-second period and block, and only the path in the
expression. So the rule cannot be limited to the `budget` host or to `POST`. It applies to `/api/auth/login` on
every hostname in the zone, which is harmless while nothing else serves that path. On a paid plan, add
`http.host eq "budget.moochermedia.co" and http.request.method eq "POST"` and lengthen both windows.

## Why stack config is committed

`Pulumi.prod.yaml` belongs in the repo. Secrets in it are `secure:` ciphertext encrypted by this stack's Pulumi
Cloud key, so the committed file cannot be decrypted without access to that Pulumi organisation. That includes the
allowed email addresses.

What is **plaintext** in there, and therefore permanent in git history: the Cloudflare `accountId` and `zoneId`.
Neither is a credential. Both are identifiers that are useless without the API token.

This is safe **because the backend is Pulumi Cloud** (`pulumi whoami` → `douglasg14b`). It would not be safe with a
self-managed backend, where the default secrets provider is a passphrase and committed ciphertext becomes
offline-crackable. If this project ever moves to `pulumi login s3://...`, gitignore the file and rotate anything
already committed.

## State backend

Pulumi Cloud, org `douglasg14b`, project `budget-tools-edge`, stack `prod`. Running `pulumi up` against a different
backend does not converge the edge. Pulumi sees empty state and creates a **second** tunnel and a conflicting DNS
record.

## Applying, in order

Order matters, because `docker-compose-prod.yml` needs `CLOUDFLARE_TUNNEL_TOKEN`. If you deploy before the token is
set in Coolify, `cloudflared` restart-loops and the public hostname stays down. The LAN path is unaffected. The
compose file hands the token to cloudflared as `TUNNEL_TOKEN`, the only name cloudflared reads.

```bash
pnpm install                 # from the repo root; infra is a workspace member
cd infra
pulumi stack select prod
pulumi preview               # expect 7 creates: the stack, tunnel, ingress, DNS record, PIN login, policy, app
pulumi up
pulumi stack output tunnelToken --show-secrets
```

1. Do [Before the first `pulumi up`](#before-the-first-pulumi-up), including the two dashboard rules.
2. `pulumi preview`, then `pulumi up`.
3. In Coolify, add `CLOUDFLARE_TUNNEL_TOKEN` to the budget-tools resource's environment with the value from step 2. Use a real
   value, never placeholder text.
4. Merge to `master` and deploy. `cloudflared` starts once `web` is healthy.
5. Run [Verifying](#verifying), and record the results in the PR.

Everything here is `protect: true`, so `pulumi destroy` refuses to remove it. To tear it down on purpose, run
`pulumi state unprotect --all` first.

## Coolify resource

Nothing about how Coolify points at this repo is in the repo, so it is recorded here:

| Setting | Value |
| --- | --- |
| Git branch | `master` |
| Compose file | `docker-compose-prod.yml` |
| Deploy trigger | _not yet recorded; fill in (push webhook or manual)_ |

Coolify gotchas carried over from Fettra:

- `${VAR:?message}` deploys the message as the value.
- In this resource, even a bare `${CLOUDFLARE_TUNNEL_TOKEN:?}` failed the deploy with "required variable ... is
  missing a value", although the variable was set and saved. Fettra's working `TUNNEL_TOKEN: ${TUNNEL_TOKEN:?}` uses
  the same name on both sides; this one maps to a different name. Use plain `${VAR}`, as the rest of the file does.
- Coolify's deployment logs echo the whole `.env` in plaintext, `CLOUDFLARE_TUNNEL_TOKEN` included. Do not paste raw
  deployment logs anywhere.

## Verifying

Run these after every change to the ingress, Access, or the rules, and paste the results into the PR. The router
serves `budget.moochermedia.co` to LAN clients from Caddy, so from inside the LAN these checks would test Caddy, not
the tunnel. Run them off-network (phone hotspot), or pin the name to Cloudflare:

```bash
CF_IP=$(dig +short budget.moochermedia.co @1.1.1.1 | head -1)
RESOLVE="--resolve budget.moochermedia.co:443:$CF_IP"
TEAM=$(cd infra && pulumi stack output accessLoginDomain)   # <team>.cloudflareaccess.com
```

Some checks need to get past Access from curl. Log in off-network in a browser, copy the `CF_Authorization` cookie
for `budget.moochermedia.co` from devtools, and set `ACCESS="-b CF_Authorization=<value>"`. It is a credential for
the next 30 days, so do not paste it into the PR.

### 1. Access stops anonymous visitors

```bash
curl -sS $RESOLVE -o /dev/null -w '%{http_code} %{redirect_url}\n' https://budget.moochermedia.co/
curl -sS $RESOLVE -D - -o /dev/null -H 'X-Requested-With: XMLHttpRequest' \
  https://budget.moochermedia.co/api/health | grep -iE '^(HTTP|x-budget-tools-api)'
```

Expect a `302` to `https://$TEAM/…` for the page. For the background request, expect `401` and **no**
`x-budget-tools-api` header. That 401 is the behaviour the web client's expired-session handling depends on. If
Access answers with a `302` instead, look in the Access application's settings for the sub-request behaviour before
changing anything in the client. The symptom in the app would be an expired Access session showing the "can't reach
the server" screen (the browser blocks the cross-origin redirect, which looks like no answer) instead of
Cloudflare's PIN page.

### 2. The app loads through the tunnel, past Access

```bash
curl -sS $RESOLVE $ACCESS -D - -o /dev/null https://budget.moochermedia.co/ | grep -iE '^(HTTP|server|cf-ray|cache-control)'
curl -sS $RESOLVE $ACCESS -D - https://budget.moochermedia.co/api/health | grep -iE '^(HTTP|cache-control|cf-cache-status|x-budget-tools-api)|ok'
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://budget.moochermedia.co/
```

Expect `200`, `server: cloudflare`, a `cf-ray`, and `index.html`'s `no-cache` header. `/api/health` should return
`200`, `cache-control: private, no-store`, `x-budget-tools-api: 1`, and a `cf-cache-status` of `DYNAMIC` or none.
Any API response must never show `HIT`. The plain-`http://` request should be a `301` to `https://`.

In a browser off-network, check the whole loop:

1. You get Cloudflare's PIN page.
2. A PIN is emailed to an allowed address.
3. You see the app's login page.
4. You log in to the app.
5. The session survives a reload.

An address not on the list must never receive a PIN that works.

### 3. An expired Access session sends you back through Cloudflare, not the app's login

With the app open in a browser off-network, revoke your Access session (Zero Trust → My Team → Users → your
address → Revoke session). Then click to a page that loads data. Expect Cloudflare's PIN page. After the PIN, you
are back in the app **still signed in to it**, without its login page. Repeat in the installed PWA on a phone.

If you land on the app's login page instead, the edge 401 is being misread as an app 401. Recheck check 1's header
expectations. If the app shows a generic failure instead, look in the browser's network tab for a `403` from
cloudflared. That means the tunnel is checking tokens against the wrong application or team (`audTags` /
`teamName` in the ingress rule), not that the client is wrong.

### 4. The app itself refuses plain HTTP

This one runs on the origin host, against `web`'s published port, because the edge redirect would otherwise answer
first:

```bash
for h in 'X-Forwarded-Proto: http' 'CF-Visitor: {"scheme":"http"}' 'X-Forwarded-Proto: https'; do
  curl -sk -o /dev/null -w "$h -> %{http_code}\n" -H "$h" "https://127.0.0.1:${WEB_PORT:-18443}/"
done
curl -s -o /dev/null -w "plain http -> %{http_code}\n" "http://127.0.0.1:${WEB_PORT:-18443}/"
curl -sk -D - -o /dev/null "https://127.0.0.1:${WEB_PORT:-18443}/api/auth/reauth" | grep -iE '^(HTTP|location)'
```

Expect `403`, `403`, `200`, then `400`. The last request should return a `302` with `location: /`, a relative URL
with no `:8443` in it.

### 5. The tunnel's request reaches `web`, not just the catch-all

Tail `web` first (`docker compose -f docker-compose-prod.yml logs -f web`, or Coolify's log view), then repeat
check 2. Each request must appear in `web`'s access log. A 404 with no log line means the request hit the tunnel's
catch-all, so the hostname in the ingress rule does not match.

### 6. Login rate limit trips

```bash
for i in $(seq 1 8); do
  curl -sS $RESOLVE $ACCESS -o /dev/null -w "%{http_code}\n" -X POST -H 'content-type: application/json' \
    -d '{"username":"ratelimit-probe","password":"x"}' https://budget.moochermedia.co/api/auth/login
done
```

Expect `401`s, then `429` within the same 10 seconds. Wait 10 seconds and one request returns `401` again.

### 7. Geo block

From a non-NA vantage point (a VPN exit in Europe, or Cloudflare's Security Events log after one such request),
expect `403` with a Cloudflare block page, not Access's PIN page. From NA, check 1 already passes.

### 8. Long requests

Run a receipt extract or categorization over the public hostname. Cloudflare cuts a request off with a `524` at
about 125 seconds on non-Enterprise plans. The API allows these up to 300 seconds, and nginx waits 310. Note how
long the real ones take. If they approach the limit, see [Follow-ups](#follow-ups).

### 9. Control: the LAN path still works

From inside the LAN, `https://budget.moochermedia.co/` still loads through Caddy, with no Cloudflare PIN page.

## Outputs

| Output | Use |
| --- | --- |
| `tunnelToken` | `CLOUDFLARE_TUNNEL_TOKEN` in Coolify, for the `cloudflared` service (secret) |
| `tunnelId` | Identifies the tunnel in the dashboard and in the CNAME target |
| `tunnelIngressVersion` | Increments when the remotely-stored ingress rules change |
| `appHostname` | The public hostname |
| `accessLoginDomain` | `<team>.cloudflareaccess.com`, where Access logins happen and its tokens' issuer |
| `accessApplicationAud` | The Access application's audience tag, which cloudflared checks tokens against |

## Follow-ups

- **External monitoring needs a service token.** Every path on the public hostname, `/api/health` included, is
  behind Access. An uptime monitor needs an Access service token and a policy that allows it. The LAN path needs
  neither.
- **Long requests vs. the 524 limit.** If receipt extract or scoring regularly exceeds ~125s over the tunnel, make
  them asynchronous (start the job, then poll) rather than raising timeouts nobody can raise on this plan.
- **Real client IPs.** nginx and the API see `cloudflared`'s Docker address, not the browser's. Nothing in the API
  is per-IP today. If that changes, trust `CF-Connecting-IP` only from the compose network, using nginx
  `real_ip_header` and `set_real_ip_from`.

## Local development

`pnpm dev` does not touch any of this. Cloudflare is a production path only. The API still sets
`X-Budget-Tools-Api` in dev, so a dev 401 is never mistaken for an expired Access session.
