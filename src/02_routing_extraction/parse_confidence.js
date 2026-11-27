// n8n Code node: "Parse Confidence"
// Parses the LLM confidence check for the enterprise path.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const item = $input.first().json;
let raw = item.choices?.[0]?.message?.content ?? '';
raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

let parsed;
try { parsed = JSON.parse(raw); }
catch(e) { parsed = {}; }

const prev = $('Parse K Fields').first().json;

const fields_inferred = [
  parsed.sector_fit_confidence,
  parsed.exec_sponsor_confidence,
  parsed.ai_appetite_confidence,
  parsed.budget_timeline_confidence,
  parsed.relationship_confidence,
  parsed.stated_revenue_confidence,
].filter(v => v === 'inferred').length;

return [{ json: {
  ...prev,
  sector_fit_confidence:      parsed.sector_fit_confidence      ?? 'inferred',
  exec_sponsor_confidence:    parsed.exec_sponsor_confidence    ?? 'inferred',
  ai_appetite_confidence:     parsed.ai_appetite_confidence     ?? 'inferred',
  budget_timeline_confidence: parsed.budget_timeline_confidence ?? 'inferred',
  relationship_confidence:    parsed.relationship_confidence    ?? 'inferred',
  stated_revenue_confidence:  parsed.stated_revenue_confidence  ?? 'inferred',
  fields_inferred
} }];
