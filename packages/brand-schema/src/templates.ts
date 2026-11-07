import type { BlockType } from "./blocks";
import type { StrategyFieldKey } from "./entities";

/**
 * Templates are data, never code. Applying one creates ordinary sections and
 * blocks the designer can rename, hide, reorder or delete. Designers can later
 * save their own guides as templates in the same shape.
 */

export type TemplateBlock = { type: BlockType; props?: Record<string, unknown> };
export type TemplateSection = {
  key: string;
  title: string;
  blocks?: TemplateBlock[];
  children?: TemplateSection[];
};
export type Template = {
  key: string;
  name: string;
  description: string;
  sections: TemplateSection[];
};

const text = (): TemplateBlock => ({ type: "text" });
const strategy = (fieldKey: StrategyFieldKey, display: "statement" | "body" | "list" = "body"): TemplateBlock => ({
  type: "strategy_field",
  props: { fieldKey, display },
});
const leaf = (key: string, title: string, blocks: TemplateBlock[] = [text()]): TemplateSection => ({ key, title, blocks });

export const COMPLETE_TEMPLATE: Template = {
  key: "complete",
  name: "Complete guide",
  description: "Strategy through to applications. Remove what you don't need.",
  sections: [
    {
      key: "strategy",
      title: "Brand strategy",
      children: [
        leaf("strategy.overview", "Brand overview", [strategy("overview")]),
        leaf("strategy.story", "Brand story", [strategy("story")]),
        leaf("strategy.mission", "Mission", [strategy("mission", "statement")]),
        leaf("strategy.vision", "Vision", [strategy("vision", "statement")]),
        leaf("strategy.purpose", "Brand purpose", [strategy("purpose", "statement")]),
        leaf("strategy.values", "Brand values", [strategy("values", "list")]),
        leaf("strategy.positioning", "Brand positioning", [strategy("positioning")]),
        leaf("strategy.audience", "Target audience", [strategy("audience")]),
        leaf("strategy.personality", "Brand personality", [strategy("personality", "list")]),
        leaf("strategy.archetype", "Brand archetype", [strategy("archetype")]),
        leaf("strategy.promise", "Brand promise", [strategy("promise", "statement")]),
        leaf("strategy.messaging", "Brand messaging", [strategy("messaging")]),
      ],
    },
    {
      key: "logo",
      title: "Logo system",
      children: [
        leaf("logo.primary", "Primary logo", [{ type: "image" }, text()]),
        leaf("logo.secondary", "Secondary logo", [{ type: "image" }, text()]),
        leaf("logo.variations", "Logo variations", [{ type: "gallery" }]),
        leaf("logo.construction", "Logo construction", [{ type: "image" }, text()]),
        leaf("logo.clearspace", "Clear space", [{ type: "image" }, text()]),
        leaf("logo.minsize", "Minimum size", [text()]),
        leaf("logo.usage", "Logo usage", [{ type: "gallery" }, text()]),
        leaf("logo.misuse", "Incorrect logo usage", [{ type: "dos_donts" }]),
      ],
    },
    {
      key: "colour",
      title: "Colour",
      children: [
        leaf("colour.primary", "Primary colours", [{ type: "palette" }]),
        leaf("colour.secondary", "Secondary colours", [{ type: "palette" }]),
        leaf("colour.supporting", "Supporting colours", [{ type: "palette" }]),
        leaf("colour.combinations", "Colour combinations", [{ type: "color_combinations" }]),
        leaf("colour.usage", "Colour usage", [text()]),
      ],
    },
    {
      key: "typography",
      title: "Typography",
      children: [
        leaf("type.primary", "Primary typeface", [{ type: "type_family" }]),
        leaf("type.secondary", "Secondary typeface", [{ type: "type_family" }]),
        leaf("type.hierarchy", "Typography hierarchy", [{ type: "type_specimen" }]),
        leaf("type.body", "Body text", [text()]),
        leaf("type.applications", "Typography applications", [{ type: "gallery" }]),
      ],
    },
    {
      key: "visual",
      title: "Visual identity",
      children: [
        leaf("visual.graphic", "Graphic elements", [{ type: "gallery" }, text()]),
        leaf("visual.patterns", "Brand patterns", [{ type: "gallery" }, text()]),
        leaf("visual.shapes", "Shapes and forms", [{ type: "gallery" }, text()]),
        leaf("visual.illustration", "Illustration style", [{ type: "gallery" }, text()]),
        leaf("visual.iconography", "Iconography", [{ type: "gallery" }, text()]),
        leaf("visual.layout", "Layout and composition", [{ type: "image" }, text()]),
        leaf("visual.grid", "Grid systems", [{ type: "image" }, text()]),
        leaf("visual.treatments", "Graphic treatments", [{ type: "gallery" }, text()]),
      ],
    },
    {
      key: "photography",
      title: "Photography and imagery",
      children: [
        leaf("photo.direction", "Photography direction", [text(), { type: "gallery" }]),
        leaf("photo.selection", "Image selection", [text()]),
        leaf("photo.composition", "Image composition", [{ type: "gallery" }]),
        leaf("photo.treatment", "Image treatment", [{ type: "gallery" }]),
        leaf("photo.dosdonts", "Photography do's and don'ts", [{ type: "dos_donts" }]),
      ],
    },
    {
      key: "motion",
      title: "Motion",
      children: [
        leaf("motion.principles", "Motion principles", [text()]),
        leaf("motion.logo", "Logo animation", [{ type: "video" }]),
        leaf("motion.transitions", "Transitions", [{ type: "video" }, text()]),
        leaf("motion.video", "Video treatments", [{ type: "video" }, text()]),
      ],
    },
    {
      key: "verbal",
      title: "Verbal identity",
      children: [
        leaf("verbal.tone", "Tone of voice", [strategy("tone")]),
        leaf("verbal.principles", "Writing principles", [text()]),
        leaf("verbal.vocabulary", "Vocabulary", [text()]),
        leaf("verbal.messaging", "Messaging guidelines", [text()]),
        leaf("verbal.examples", "Communication examples", [{ type: "dos_donts" }]),
      ],
    },
    {
      key: "applications",
      title: "Applications",
      children: [
        leaf("apps.social", "Social media", [{ type: "gallery" }]),
        leaf("apps.stationery", "Stationery", [{ type: "gallery" }]),
        leaf("apps.packaging", "Packaging", [{ type: "gallery" }]),
        leaf("apps.merch", "Merchandise", [{ type: "gallery" }]),
        leaf("apps.signage", "Signage", [{ type: "gallery" }]),
        leaf("apps.web", "Website", [{ type: "gallery" }]),
        leaf("apps.marketing", "Marketing materials", [{ type: "gallery" }]),
      ],
    },
  ],
};

export const ESSENTIALS_TEMPLATE: Template = {
  key: "essentials",
  name: "Identity essentials",
  description: "Logo, colour and type only. Quick to finish, easy to extend.",
  sections: [
    {
      key: "logo",
      title: "Logo",
      children: [
        leaf("logo.primary", "Primary logo", [{ type: "image" }, text()]),
        leaf("logo.clearspace", "Clear space and minimum size", [{ type: "image" }, text()]),
        leaf("logo.misuse", "Incorrect use", [{ type: "dos_donts" }]),
      ],
    },
    {
      key: "colour",
      title: "Colour",
      blocks: [{ type: "palette" }, { type: "color_combinations" }],
    },
    {
      key: "typography",
      title: "Typography",
      blocks: [{ type: "type_family" }, { type: "type_specimen" }],
    },
  ],
};

export const BLANK_TEMPLATE: Template = {
  key: "blank",
  name: "Blank guide",
  description: "One empty section. Build everything yourself.",
  sections: [{ key: "intro", title: "Introduction", blocks: [text()] }],
};

export const TEMPLATES: Record<string, Template> = {
  [COMPLETE_TEMPLATE.key]: COMPLETE_TEMPLATE,
  [ESSENTIALS_TEMPLATE.key]: ESSENTIALS_TEMPLATE,
  [BLANK_TEMPLATE.key]: BLANK_TEMPLATE,
};

export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 63) || "section"
  );
}
