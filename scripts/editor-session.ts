// Simulates an editing session with the real editor model and save queue, and
// prints the batches the browser would send, plus the state the guide should end in.
// supabase/tests/004_editor_session.sql replays the batches through apply_draft_ops.
import { TEMPLATES, templateToOps } from "../packages/brand-schema/src/index";
import {
  addBlock,
  addSection,
  childSections,
  deleteBlock,
  deleteSection,
  duplicateSection,
  moveBlock,
  moveSection,
  sectionBlocks,
  setStrategy,
  textToDoc,
  updateBlockProps,
  updateSection,
  type BlockRow,
  type Draft,
  type Result,
  type SectionRow,
} from "../apps/web/src/editor/model";
import { SaveQueue } from "../apps/web/src/editor/save-queue";
import {
  addColor,
  addFamily,
  addStandardScale,
  deleteColor,
  deleteStyle,
  orderedStyles,
  updateColor,
} from "../apps/web/src/editor/brand-system";
import { addAsset, addFontFile, deleteAsset } from "../apps/web/src/editor/assets";

// Start from the Essentials template, exactly as the app creates it.
const templateOps = templateToOps(TEMPLATES.essentials!);
let draft: Draft = { sections: {}, blocks: {}, strategy: {}, colors: {}, families: {}, styles: {}, assets: {}, fontFiles: {} };
for (const op of templateOps) {
  if (op.table === "sections") draft.sections[op.row.id as string] = op.row as unknown as SectionRow;
  if (op.table === "blocks") draft.blocks[op.row.id as string] = { parent_block_id: null, ...(op.row as object) } as BlockRow;
}

const queue = new SaveQueue();
const batches: unknown[] = [templateOps];
const run = (r: Result) => {
  draft = r.draft;
  if (r.drop) queue.drop(r.drop);
  queue.push(r.ops);
  return r;
};
const save = () => {
  if (queue.size) batches.push(queue.take());
};

const [logo, colour, typography] = childSections(draft, null);

// Batch 2: typing in a new section, several keystrokes merged into one save.
const story = run(addSection(draft, null, "Brand story")).created!;
const storyText = sectionBlocks(draft, story)[0]!.id;
for (const t of ["O", "Os", "Osan began", "Osan began in a market."]) run(updateBlockProps(draft, storyText, { doc: textToDoc(t) }));
run(addBlock(draft, story, "strategy_field", storyText, { fieldKey: "mission" }));
run(setStrategy(draft, "mission", "Feed people well."));
save();

// Batch 3: drag Brand story to the top, rename, hide, duplicate Colour.
run(moveSection(draft, story, 0));
run(updateSection(draft, typography!.id, { title: "Type", hidden: true }));
const colourCopy = run(duplicateSection(draft, colour!.id)).created!;
save();

// Batch 4: add then delete in the same batch (never reaches the database), reorder blocks, delete a section.
const temp = run(addSection(draft, logo!.id, "Temporary")).created!;
run(addBlock(draft, temp, "heading", null, { text: "Gone" }));
run(deleteSection(draft, temp));
const heading = run(addBlock(draft, story, "heading", null, { text: "Our story", level: 2 })).created!;
run(moveBlock(draft, heading, 1));
run(deleteBlock(draft, storyText));
run(deleteSection(draft, colourCopy));
save();

// Batch 5: brand system. Colours, a palette using them, recolour, delete one in use.
const red = run(addColor(draft, { name: "Pepper Red", hex: "c8402b" })).created!;
const ink = run(addColor(draft, { name: "Ink", hex: "#1b1b1b", group: "secondary" })).created!;
const palm = run(addColor(draft, { name: "Palm Oil", hex: "#E9A23B" })).created!;
const palette = run(addBlock(draft, colour!.id, "palette", null, { tokenIds: [red, palm, ink] })).created!;
run(addBlock(draft, colour!.id, "color_combinations", palette, { pairs: [{ foregroundId: ink, backgroundId: palm }] }));
run(updateColor(draft, red, { hex: "#B33A26", cmyk_override: { c: 0, m: 80, y: 95, k: 10 } }));
run(deleteColor(draft, palm));
save();

// Batch 6: typography. Two typefaces, a standard scale, a specimen, delete a style it shows.
const serif = run(addFamily(draft, { name: "Fraunces" })).created!;
const sans = run(addFamily(draft, { name: "DM Sans" })).created!;
run(addStandardScale(draft, serif, sans));
const styleIds = orderedStyles(draft).map((s) => s.id);
run(addBlock(draft, typography!.id, "type_specimen", null, { styleIds }));
run(deleteStyle(draft, styleIds[4]!));
save();

// Batch 7: assets. Files uploaded to storage become asset rows; blocks reference them;
// a font file attaches to an uploaded typeface; deleting a used asset cleans up.
const BRAND = "b8000000-0000-4000-8000-000000000001";
const assetRow = (id: string, name: string, mime: string, category: "logo" | "photography" | "font", visible: boolean) => ({
  id,
  category,
  name,
  storage_path: `${BRAND}/${id}/${name}`,
  mime,
  size: 2048,
  width: mime.startsWith("image/") ? 400 : null,
  height: mime.startsWith("image/") ? 200 : null,
  client_visible: visible,
});
const logoId = "a5500000-0000-4000-8000-000000000001";
const photoId = "a5500000-0000-4000-8000-000000000002";
const fontId = "a5500000-0000-4000-8000-000000000003";
run(addAsset(draft, assetRow(logoId, "osan-logo.svg", "image/svg+xml", "logo", true)));
run(addAsset(draft, assetRow(photoId, "market.jpg", "image/jpeg", "photography", false)));
run(addAsset(draft, assetRow(fontId, "BrandSans-Bold.woff2", "font/woff2", "font", false)));
const logoSection = childSections(draft, null).find((s) => s.title === "Logo")!;
run(addBlock(draft, logoSection.id, "image", null, { assetId: logoId, alt: "Osan logo" }));
const gallery = run(addBlock(draft, logoSection.id, "gallery", null, { assetIds: [logoId, photoId] })).created!;
const brandSans = run(addFamily(draft, { name: "Brand Sans", source: "upload" })).created!;
run(addFontFile(draft, { family_id: brandSans, asset_id: fontId, weight: 700, style: "normal" }));
run(deleteAsset(draft, photoId));
save();

const top = childSections(draft, null);
const paletteBlock = draft.blocks[palette]!;
process.stdout.write(
  JSON.stringify({
    batches,
    expect: {
      topTitles: top.map((s) => s.title).join("|"),
      sectionCount: Object.keys(draft.sections).length,
      blockCount: Object.keys(draft.blocks).length,
      storyBlocks: sectionBlocks(draft, story).map((b) => b.type).join("|"),
      hiddenTitle: Object.values(draft.sections).find((s) => s.hidden)?.title ?? "",
      paletteTokens: (paletteBlock.props.tokenIds as string[]).join("|"),
      colorCount: Object.keys(draft.colors).length,
      styleNames: orderedStyles(draft).map((s) => s.name).join("|"),
      redHex: draft.colors[red]!.hex,
      assetCount: Object.keys(draft.assets).length,
      galleryIds: (draft.blocks[gallery]!.props.assetIds as string[]).join("|"),
      fontFileCount: Object.keys(draft.fontFiles).length,
    },
  }),
);
