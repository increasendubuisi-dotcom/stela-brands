"use client";

import { weightsByFamily } from "./brand-system";
import type { Draft } from "./model";

/**
 * Loads the brand's Google Fonts so specimens render in the real typefaces.
 * One stylesheet per family and weight: Google rejects a whole request if any
 * single weight doesn't exist, so a typo in one style never breaks the others.
 */
export function FontLoader({ draft }: { draft: Draft }) {
  const weights = weightsByFamily(draft);
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
      {links.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="brand-fonts" />
      ))}
    </>
  );
}
