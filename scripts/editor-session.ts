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

// Start from the Essentials template, exactly as the app creates it.
const templateOps = templateToOps(TEMPLATES.essentials!);
let draft: Draft = { sections: {}, blocks: {}, strategy: {} };
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

const top = childSections(draft, null);
process.stdout.write(
  JSON.stringify({
    batches,
    expect: {
      topTitles: top.map((s) => s.title).join("|"),
      sectionCount: Object.keys(draft.sections).length,
      blockCount: Object.keys(draft.blocks).length,
      storyBlocks: sectionBlocks(draft, story).map((b) => b.type).join("|"),
      hiddenTitle: Object.values(draft.sections).find((s) => s.hidden)?.title ?? "",
    },
  }),
);
