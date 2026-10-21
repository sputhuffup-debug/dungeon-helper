/** A module's licence and the attribution it requires. Plain text only: pack strings are never rendered as HTML. */
import type { ModuleLicense } from "@campaign-forge/module-sdk";

/** Only http(s) links from module data become links. */
export function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export function ModuleLicenseView({ license, testId }: { license: ModuleLicense; testId?: string }) {
  const href = safeHttpUrl(license.url);
  return (
    <div className="app-module-licence" data-testid={testId}>
      <p className="app-module-licence__name">
        Licence:{" "}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {license.name}
          </a>
        ) : (
          license.name
        )}
        {license.spdx ? <span className="cf-muted"> ({license.spdx})</span> : null}
      </p>
      <p className="app-licence app-module-licence__attribution">{license.attribution}</p>
    </div>
  );
}

/** The loaded module's licence, folded away at the foot of pages that show its content (rules, reference). */
export function ModuleAttribution({ license }: { license: ModuleLicense | undefined }) {
  if (!license) return null;
  return (
    <details className="app-attribution" data-testid="page-attribution">
      <summary className="cf-muted">Licence and attribution</summary>
      <ModuleLicenseView license={license} />
    </details>
  );
}
