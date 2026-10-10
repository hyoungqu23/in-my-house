import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const [legacyFile, balancedFile, outputFile = 'docs/plans/assets/moonlit-inn/balance-summary.json'] = process.argv.slice(2);
assert(legacyFile && balancedFile, 'Usage: node scripts/moonlit-inn/balance-summary.mjs LEGACY.json BALANCED.json [SUMMARY.json]');
const reports = [legacyFile, balancedFile].map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
assert.equal(reports[0].ruleVersion, 'playtest-1');
assert.equal(reports[1].ruleVersion, 'balanced-1');
assert.equal(reports[0].seeds, reports[1].seeds);
assert.equal(reports[0].seedBase, reports[1].seedBase);
assert.deepEqual(reports[0].sourceHashes, reports[1].sourceHashes);
const summary = {
  date: reports[1].date, seedsPerPolicy: reports[1].seeds, seedBase: reports[1].seedBase,
  assumptions: reports[1].assumptions,
  profiles: reports.map(report => ({
    ruleVersion: report.ruleVersion,
    parameters: { rabbitBase: report.rabbitBase, catBase: 2, woodCatBonus: report.woodCatBonus, moonCap: report.moonCap },
    woodToQuilt: report.structural.furniture.find(row => row.from === 'wood' && row.to === 'quilt'),
    furnitureMarginal: report.structural.marginal,
    structuralWeighting: report.structural.weighting,
    groups: report.groups.map(group => ({
      ...Object.fromEntries(Object.entries(group).filter(([key]) => !['records', 'choices'].includes(key))),
      rabbitAcquisition: {
        chosen: group.choices.pickedGuests[0], forced: group.choices.forcedGuests[0],
        chosenShare: group.choices.pickedGuests[0] / (group.choices.pickedGuests[0] + group.choices.forcedGuests[0]),
        meaning: 'Share of acquired rabbit bundles chosen during the two draft decisions, rather than received as the last forced bundle. Bundle furniture also affects this proxy.',
      },
    })),
    seatAudit: report.seatAudit, mixedSkill: report.mixedSkill,
  })),
  sourceHashes: reports[1].sourceHashes,
};
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ outputFile, profiles: summary.profiles.map(p => p.ruleVersion), seedsPerPolicy: summary.seedsPerPolicy }));
