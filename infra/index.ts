import {
    DnsRecord,
    getZeroTrustOrganizationOutput,
    getZeroTrustTunnelCloudflaredTokenOutput,
    ZeroTrustAccessApplication,
    ZeroTrustAccessIdentityProvider,
    ZeroTrustAccessPolicy,
    ZeroTrustTunnelCloudflared,
    ZeroTrustTunnelCloudflaredConfig,
} from '@pulumi/cloudflare';
import { Config, interpolate, secret } from '@pulumi/pulumi';

/**
 * Budget Tools' public edge: one hostname, reaching the home origin through one remotely-managed Cloudflare Tunnel,
 * so the origin publishes no inbound port to the internet and never exposes its IP.
 *
 *   - budget.moochermedia.co — the web SPA, served by the `web` nginx container in docker-compose-prod.yml.
 *
 * One hostname is the whole surface because the SPA and the API are already same-origin: the web client's API base
 * URL is a relative `/api`, and nginx proxies it to the `api` service over the compose network. So `api` needs no
 * ingress rule of its own, and there is no CORS allow-list or second public URL to keep consistent.
 *
 * The LAN path (Caddy → web's published WEB_PORT) is untouched and keeps working alongside this. Router DNS points
 * LAN clients at Caddy, so they never use the tunnel.
 *
 * Cloudflare Access sits in front of the hostname: a request without a valid Access session for one of the allowed
 * email addresses is stopped at the edge and sent to Cloudflare's login (an emailed one-time PIN). It is layered, not
 * a replacement: past Access, the app still asks for its own password. The two are independent factors, and the app
 * neither reads nor trusts the Access identity. cloudflared checks the Access token itself (`required: true` on the
 * ingress rule), so if the Access application were ever deleted or misconfigured, the site fails closed rather than
 * open.
 *
 * Deliberately NOT declared here:
 *   - Every other record in moochermedia.co. The zone already serves other things, and this program must not put
 *     their DNS at the mercy of a `pulumi up`.
 *   - WAF custom rules and rate limiting rules (the geo-block and the login rate limit for this hostname). The zone
 *     already has hand-made firewall rules, and each of those phases is one zone-wide ruleset: declaring it here
 *     would make Pulumi the owner of every rule in it, the zone's other rules included. They are added by hand in
 *     the dashboard instead; infra/README.md has the exact expressions.
 *   - The Zero Trust organization itself (the `<team>.cloudflareaccess.com` login domain). It is created once by
 *     hand in the Zero Trust dashboard, and this program reads it rather than owning it.
 */

/** DNS zone that Cloudflare already serves. This program only adds to it. */
const ZONE_NAME = 'moochermedia.co';

/** The public hostname. Already in the web image's certificate SANs (apps/web/Dockerfile, TLS_CERT_HOSTS). */
const APP_HOSTNAME = `budget.${ZONE_NAME}`;

/**
 * Where cloudflared sends traffic for that hostname. `web` is the Docker DNS name of the nginx service in
 * docker-compose-prod.yml, on its container port — a sibling in the same Compose project, not localhost.
 *
 * https because nginx listens on TLS only: nothing crosses the network in plaintext, including this hop. The
 * certificate is self-signed and regenerated per boot (docker/generate-self-signed-cert.sh), so there is nothing
 * stable to verify against, hence `noTlsVerify` on the rule below. It is the same trade Caddy makes with
 * `tls_insecure_skip_verify`: encryption on the hop, with identity established by the Docker network.
 */
const APP_ORIGIN = 'https://web:8443';

/**
 * Catch-all ingress rule. cloudflared requires the last rule to have no hostname. It answers anything the rule
 * above did not match, i.e. any hostname other than the one declared here.
 */
const UNMATCHED_REQUEST_RESPONSE = 'http_status:404';

/** Cloudflare's "automatic" TTL. Proxied records must use it — the edge, not the resolver, controls caching. */
const DNS_TTL_AUTOMATIC = 1;

const config = new Config();

/** Cloudflare account that owns the tunnel. */
const accountId = config.require('accountId');

/** Zone that holds the app's record. */
const zoneId = config.require('zoneId');

/**
 * Who Access lets through: a JSON array of email addresses. Secret config, so the addresses never appear in plaintext
 * in the committed stack file.
 */
const accessAllowedEmails = config.requireSecretObject<string[]>('accessAllowedEmails');

/**
 * How long an Access login lasts before Cloudflare asks for a fresh PIN. Thirty days keeps prompts rare on the
 * public path while still re-checking periodically; the app's own 90-day session is independent of it.
 */
const ACCESS_SESSION_DURATION = '720h';

/** Suffix of every Zero Trust organization's login domain. The team name is what precedes it. */
const ACCESS_AUTH_DOMAIN_SUFFIX = '.cloudflareaccess.com';

/**
 * The Zero Trust organization, created by hand (see README). Read rather than configured, so the team name cannot be
 * mistyped, and a missing organization fails `pulumi preview` loudly instead of producing a tunnel that checks tokens
 * against a team that does not exist.
 */
const accessOrganization = getZeroTrustOrganizationOutput({ accountId });

/** `<team>.cloudflareaccess.com`: where Access logins happen, and the issuer of the tokens cloudflared checks. */
const accessTeamDomain = accessOrganization.authDomain;

/** cloudflared wants the bare team name, not the domain. */
const accessTeamName = accessTeamDomain.apply((domain) => {
    if (!domain.endsWith(ACCESS_AUTH_DOMAIN_SUFFIX)) {
        throw new Error(`Unexpected Zero Trust auth domain "${domain}"; expected <team>${ACCESS_AUTH_DOMAIN_SUFFIX}.`);
    }
    return domain.slice(0, -ACCESS_AUTH_DOMAIN_SUFFIX.length);
});

/**
 * One-time PIN: Access emails a code to the address being checked. No external identity provider to set up or keep
 * alive. An account can hold only one of these, so if the Zero Trust onboarding already added it, import that one
 * (README) rather than letting this create a second.
 */
const oneTimePinLogin = new ZeroTrustAccessIdentityProvider(
    'access-one-time-pin',
    {
        accountId,
        name: 'One-time PIN',
        type: 'onetimepin',
        config: {},
    },
    // Access, its login method, and its policy are part of the public path now: cloudflared refuses requests without
    // a valid token for this application, so deleting any of them takes the hostname offline.
    { protect: true },
);

/** The allow-list. Reusable account-level policy, attached to the application below. */
const allowedPeoplePolicy = new ZeroTrustAccessPolicy(
    'access-allowed-people',
    {
        accountId,
        name: 'Budget Tools: allowed people',
        decision: 'allow',
        includes: accessAllowedEmails.apply((emails) => emails.map((email) => ({ email: { email } }))),
        // No sessionDuration here on purpose. A policy's duration overrides the application's, so the
        // application below is the single place the session length is set.
    },
    { protect: true },
);

/** The Access gate on the hostname. */
const appAccess = new ZeroTrustAccessApplication(
    'app-access',
    {
        accountId,
        name: 'Budget Tools',
        type: 'self_hosted',
        domain: APP_HOSTNAME,
        sessionDuration: ACCESS_SESSION_DURATION,
        policies: [{ id: allowedPeoplePolicy.id, precedence: 1 }],
        // PIN is the only login method, so skip the method-picker page and go straight to the email prompt.
        allowedIdps: [oneTimePinLogin.id],
        autoRedirectToIdentity: true,
        // Not a tile in the Zero Trust app launcher; the app is reached by its own URL.
        appLauncherVisible: false,
        // The Access cookie never needs to be readable by JavaScript. The app's re-login is a navigation, not a
        // script reading the cookie (see apps/web/src/auth/edgeSession.ts).
        httpOnlyCookieAttribute: true,
    },
    { protect: true },
);

/**
 * Tunnel identity. `configSrc: 'cloudflare'` makes it remotely managed: Cloudflare stores the ingress rules
 * (declared below), so the connector in docker-compose-prod.yml runs with only a token and no config file.
 */
const appTunnel = new ZeroTrustTunnelCloudflared(
    'app-tunnel',
    {
        accountId,
        name: 'budget-tools',
        configSrc: 'cloudflare',
    },
    // The tunnel, its ingress, and the DNS record are the entire public path to the origin. `protect` makes an
    // accidental `pulumi destroy` fail loudly instead of taking the hostname offline; see README to unprotect.
    { protect: true },
);

/** The remotely-stored ingress rules. One public hostname, then the required catch-all. */
const appTunnelIngress = new ZeroTrustTunnelCloudflaredConfig(
    'app-ingress',
    {
        accountId,
        tunnelId: appTunnel.id,
        config: {
            ingresses: [
                {
                    hostname: APP_HOSTNAME,
                    service: APP_ORIGIN,
                    originRequest: {
                        noTlsVerify: true,
                        // cloudflared validates the Access token on every request before forwarding it. Access already
                        // enforces this at the edge; this second check is what makes a deleted or misconfigured Access
                        // application fail closed instead of publishing the app to everyone in the geo allow-list.
                        access: { required: true, teamName: accessTeamName, audTags: [appAccess.aud] },
                    },
                },
                { service: UNMATCHED_REQUEST_RESPONSE },
            ],
        },
    },
    { protect: true },
);

/**
 * The public hostname, pointed at the tunnel. Proxied, so Cloudflare terminates TLS and serves the hostname; the
 * cfargotunnel.com target only resolves inside Cloudflare's network.
 *
 * The `dependsOn` matters. The record derives only from the tunnel id, which would let Pulumi publish DNS before the
 * remotely-stored ingress rules exist — the hostname would resolve to a tunnel with no route and serve errors until
 * the rules caught up. Wait for the ingress.
 */
new DnsRecord(
    'app-dns',
    {
        zoneId,
        name: APP_HOSTNAME,
        type: 'CNAME',
        content: interpolate`${appTunnel.id}.cfargotunnel.com`,
        proxied: true,
        ttl: DNS_TTL_AUTOMATIC,
        comment: 'Budget Tools web app via Cloudflare Tunnel. Managed by Pulumi (budget-tools infra/).',
    },
    { protect: true, dependsOn: [appTunnelIngress] },
);

export const tunnelId = appTunnel.id;
export const tunnelIngressVersion = appTunnelIngress.version;

/** Cloudflare normalises DnsRecord.name to the zone-relative label, so export the FQDN operators actually need. */
export const appHostname = APP_HOSTNAME;

/** Where Access logins happen, and the issuer of its tokens. */
export const accessLoginDomain = accessTeamDomain;

/** The Access application's audience tag; cloudflared rejects tokens minted for any other application. */
export const accessApplicationAud = appAccess.aud;

/**
 * What CLOUDFLARE_TUNNEL_TOKEN in docker-compose-prod.yml consumes. Anyone holding it can run a connector for this tunnel, so it
 * is a secret: encrypted in stack state and withheld from `pulumi stack output` unless asked for explicitly.
 */
export const tunnelToken = secret(
    getZeroTrustTunnelCloudflaredTokenOutput({ accountId, tunnelId: appTunnel.id }).token,
);
