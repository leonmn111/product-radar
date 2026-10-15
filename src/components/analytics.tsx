// Site analytics: OFF until one provider is configured (Railway → web → Variables, then
// redeploy; the values are read when the site is built). Nothing loads otherwise.
//
//   Plausible (recommended): NEXT_PUBLIC_PLAUSIBLE_DOMAIN=theproductradar.io
//     Cookieless, so no consent banner is needed. NEXT_PUBLIC_PLAUSIBLE_SRC points
//     at a self-hosted script instead of plausible.io's.
//   PostHog: NEXT_PUBLIC_POSTHOG_KEY=phc_…  (NEXT_PUBLIC_POSTHOG_HOST defaults to the EU cloud)
//     Runs with in-memory persistence: no cookies or local storage, so no consent banner,
//     but a visitor counts as new after a full page reload. Switch `persistence` only
//     once the site asks for cookie consent.
//
// Conversions are page views, so no custom events are needed: /signin?tab=register is a
// started sign-up, /dashboard a signed-in account, /billing/success a paid Pro upgrade.

const POSTHOG_DEFAULT_HOST = "https://eu.i.posthog.com";

export function analyticsConfig(env: Record<string, string | undefined> = process.env) {
  const plausible = env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  if (plausible) {
    return { provider: "plausible" as const, domain: plausible, src: env.NEXT_PUBLIC_PLAUSIBLE_SRC?.trim() || "https://plausible.io/js/script.js" };
  }
  const key = env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (key) return { provider: "posthog" as const, key, host: (env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || POSTHOG_DEFAULT_HOST).replace(/\/+$/, "") };
  return null;
}

/** PostHog's standard loader stub, then init. Values go through JSON.stringify, so they can't break out of the script. */
function posthogSnippet(key: string, host: string) {
  return `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags identify setPersonProperties group resetGroups reset get_distinct_id getGroups get_session_id alias set_config opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(key)},{api_host:${JSON.stringify(host)},persistence:"memory",person_profiles:"identified_only"});`;
}

/**
 * Drop-in tracking script for the root layout's <head>; renders nothing until configured.
 * Plain tags sent with the HTML (each vendor's documented Next.js setup): `defer` and the
 * async loader never hold up the first paint. (next/script's afterInteractive only
 * preloaded the file here and never ran it.)
 */
export function Analytics() {
  const config = analyticsConfig();
  if (!config) return null;
  if (config.provider === "plausible") return <script defer data-domain={config.domain} src={config.src} />;
  return <script id="posthog" dangerouslySetInnerHTML={{ __html: posthogSnippet(config.key, config.host) }} />;
}
