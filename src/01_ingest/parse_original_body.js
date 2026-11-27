// n8n Code node: "Parse Original Body"
// Reads the translation response and keeps both original and English text.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const item = $input.first().json;
let raw = item.choices?.[0]?.message?.content ?? '';
if (typeof raw !== 'string') { return [{ json: { parse_error: true, raw_output: raw } }]; }
raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
let parsed;
try { parsed = JSON.parse(raw); }
catch (e) { return [{ json: { parse_error: true, raw_output: raw } }]; }

const emailData = $('Extract Email Fields').first()?.json || {};

return [{ json: {
  // pass everything from original email through
  subject:            emailData.subject     || '',
  from_name:          emailData.from_name   || '',
  from_email:         emailData.from_email  || '',
  from_phone:         emailData.from_phone  || '',
  received_at:        emailData.received_at || '',
  // language fields
  detected_language:  parsed.detected_language  || 'en',
  is_english:         parsed.is_english          ?? true,
  original_body:      parsed.original_body       || emailData.body || '',
  body:               parsed.translated_body     || emailData.body || '',
} }];
