import { readFileSync, writeFileSync } from "node:fs";
import type { ExperimentDocument } from "../src/modules/connected-forest/analysis/decision-audit";
const output = process.argv[2];
const paths = process.argv.slice(3);
if (!output || paths.length < 2) throw new Error("Pass output and at least two disjoint cohort files");
type Document = ExperimentDocument & { tools: boolean; order: string; skill: string; cohorts: string[]; senders: string[]; counts: number[] };
const documents = paths.map((path) => JSON.parse(readFileSync(path, "utf8")) as Document);
const base = documents[0];
for (const document of documents) {
  if (!document.completed || document.engineSha256 !== base.engineSha256 || document.runs !== base.runs || document.seedBase !== base.seedBase || document.tools !== base.tools || document.order !== base.order || document.skill !== base.skill || JSON.stringify(document.candidates) !== JSON.stringify(base.candidates)) throw new Error("Cannot merge incomplete or incompatible experiments");
}
const cases = documents.flatMap((document) => document.cases);
const keys = cases.map((row) => `${row.candidateId}:${row.cohort}:${row.sender}:${row.playerCount}`);
if (new Set(keys).size !== keys.length) throw new Error("Duplicate conditions in merge");
writeFileSync(output, JSON.stringify({ ...base, mergedFrom: paths, cohorts: [...new Set(documents.flatMap((document) => document.cohorts))], expectedCases: cases.length, cases }, null, 2));
console.log(`${output}: ${cases.length} conditions`);
