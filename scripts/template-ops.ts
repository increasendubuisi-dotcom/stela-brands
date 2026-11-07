// Prints the draft ops for a template as JSON. Used by the database tests to
// prove every template applies cleanly through apply_draft_ops.
import { TEMPLATES, templateToOps } from "../packages/brand-schema/src/index";

const key = process.argv[2] ?? "complete";
const template = TEMPLATES[key];
if (!template) {
  console.error(`Unknown template: ${key}`);
  process.exit(1);
}
process.stdout.write(JSON.stringify(templateToOps(template)));
