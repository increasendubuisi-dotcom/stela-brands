"use client";

import { cssFamilyName, weightsByFamily } from "./brand-system";
import type { Draft } from "./model";

/**
 * Loads the brand's Google Fonts so specimens render in the real typefaces.
 * One stylesheet per family and weight: Google rejects a whole request if any
 * single weight doesn't exist, so a typo in one style never breaks the others.
 */
export function FontLoader({ draft, urls = {} }: { draft: Draft; urls?: Record<string, string> }) {
  const weights = weightsByFamily(draft);
  // Uploaded fonts: one @font-face per file, served from short-lived private URLs.
  const faces = Object.values(draft.fontFiles)
    .map((ff) => {
      const family = draft.families[ff.family_id];
      const url = urls[ff.asset_id];
      if (!family || !url) return "";
      if (!/^https:\/\//.test(url)) return "";
      return `@font-face{font-family:"${cssFamilyName(family.name)}";src:url("${encodeURI(url)}");font-weight:${ff.weight};font-style:${ff.style};font-display:swap;}`;
    })
    .join("\n");
  const links: string[] = [];
  for (const f of Object.values(draft.families)) {
    if (f.source !== "google") continue;
    const family = encodeURIComponent(f.name).replace(/%20/g, "+");
    for (const w of weights.get(f.id) ?? [400]) {
      links.push(`https://fonts.googleapis.com/css2?family=${family}:wght@${w}&display=swap`);
    }
  }
  return (
    <>
      {faces ? <style>{faces}</style> : null}
      {links.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="brand-fonts" />
      ))}
    </>
  );
}
