// n8n Code node: "Code in JavaScript"
// Builds the Twenty CRM task title and markdown body from the scored lead.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const item = $input.first().json;

let reasons = item.top_reasons;
if (typeof reasons === 'string') {
  try { reasons = JSON.parse(reasons); } catch(e) { reasons = []; }
}
reasons = Array.isArray(reasons) ? reasons : [];

const icon = (i) => i === 'pass' ? '✅' : i === 'partial' ? '🔶' : '⚠️';
const r0 = reasons[0] || {};
const r1 = reasons[1] || {};
const r2 = reasons[2] || {};

const flags = Array.isArray(item.tp_flags) 
  ? item.tp_flags.join(', ') 
  : JSON.stringify(item.tp_flags || []);

const attrs = item.attribute_scores || {};
const attrLines = Object.entries(attrs)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n');

const path = item.path || 'k';
const pathLabel = path === 'k' ? 'K' : path === 'consumer' ? 'Consumer' : 'Retail';

const title = `[${pathLabel}] ${item.sender_name} | Score: ${item.score} | ${item.sender_email} | lead_id:${item.id}`;

const markdown = [
  `**Score:** ${item.score} / 100 | **Tier:** ${item.tier} | **Confidence:** ${item.confidence_level}`,
  '',
  '**Top Reasons:**',
  `${icon(r0.icon)} ${r0.attribute || ''} — ${r0.text || ''}`,
  `${icon(r1.icon)} ${r1.attribute || ''} — ${r1.text || ''}`,
  `${icon(r2.icon)} ${r2.attribute || ''} — ${r2.text || ''}`,
  '',
  '**Attribute Scores:**',
  attrLines,
  '',
  `**TP Flags:** ${flags}`
].join('\n');

// Sanitize all strings for JSON safety (escape newlines, quotes, control chars)
function safe(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

// Build the complete JSON body as a string so it's always valid
const bodyObj = {
  title: title + '',
  bodyV2: { markdown: markdown },
  senderName: item.sender_name || '',
  senderEmail: item.sender_email || '',
  companyName: item.company_name || '',
  useCase: item.use_case || '',
  budgetSignal: item.budget_signal || '',
  timelineSignal: item.timeline_signal || '',
  teamSize: String(item.team_size || ''),
  urgency: item.urgency_level || item.urgency || '',
  leadScore: String(item.score ?? ''),
  leadConfidence: item.confidence_level || '',
  recommendation: item.recommended_action || '',
  reviewerNote: '',
};

return [{
  json: {
    ...item,
    twenty_body: JSON.stringify(bodyObj),
  }
}];
