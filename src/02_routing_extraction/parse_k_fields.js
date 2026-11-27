// n8n Code node: "Parse K Fields"
// Validates the enterprise extraction JSON and maps it to scoring signals.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const item = $input.first().json;
let raw = item.choices?.[0]?.message?.content ?? item.data?.choices?.[0]?.message?.content ?? '';
if (typeof raw !== 'string') { return [{ json: { parse_error: true, raw_output: raw } }]; }
raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
let parsed;
try { parsed = JSON.parse(raw); }
catch (e) { return [{ json: { parse_error: true, raw_output: raw } }]; }

const path = $('Parse Path').first()?.json?.path || 'k';
const emailData = $('Parse Original Body').first()?.json || {};

// stated_revenue_aud — must be integer or null, never empty string
// the trigger does numeric comparisons so it needs a real number or null
const rawRevenue = parsed.stated_revenue_aud;
const stated_revenue_aud = (rawRevenue !== '' && rawRevenue !== null && rawRevenue !== undefined && !isNaN(Number(rawRevenue)))
  ? parseInt(rawRevenue, 10)
  : null;

// booleans — LLM sometimes returns strings 'true'/'false', normalise to real booleans
const price_shopping    = parsed.price_shopping === true    || parsed.price_shopping    === 'true';
const cannot_influence  = parsed.cannot_influence === true  || parsed.cannot_influence  === 'true'
                       || parsed.cannot_influence_decision === true || parsed.cannot_influence_decision === 'true';

// fields_inferred — DO NOT cap at 2 anymore, the v5 trigger uses the real value
// for confidence calculation. Let the trigger decide confidence level.
const fields_inferred = typeof parsed.fields_inferred === 'number'
  ? Math.min(parsed.fields_inferred, 6)
  : 0;

return [{ json: {
  path,
  subject:                emailData.subject             || '',
  from_name:              emailData.from_name           || '',
  from_email:             emailData.from_email          || '',
  detected_language:      emailData.detected_language   || 'en',
  original_body:          emailData.original_body       || '',
  sender_name:            parsed.sender_name            ?? '',
  sender_email:           parsed.sender_email           ?? '',
  company_name:           parsed.company_name           ?? '',
  team_size:              parsed.team_size              ?? '',
  stated_revenue_aud,
  sector_fit_signal:      parsed.sector_fit_signal      ?? '',
  sector_fit_confidence:  parsed.sector_fit_confidence  ?? 'inferred',
  exec_sponsor_signal:    parsed.exec_sponsor_signal    ?? '',
  ai_appetite_signal:     parsed.ai_appetite_signal     ?? '',
  budget_timeline_signal: parsed.budget_timeline_signal ?? '',
  relationship_signal:    parsed.relationship_signal    ?? '',
  budget_signal:          parsed.budget_signal          ?? '',
  timeline_signal:        parsed.timeline_signal        ?? '',
  price_shopping,
  cannot_influence,
  fields_inferred
} }];
