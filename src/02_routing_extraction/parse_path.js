// n8n Code node: "Parse Path"
// Parses the LLM path classifier output into k, consumer or retail.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const item = $input.first().json;

let raw =
  item.choices?.[0]?.message?.content ??
  item.data?.choices?.[0]?.message?.content ??
  '';

if (typeof raw !== 'string') {
  return [{ json: { path: 'k', parse_error: true } }];
}

raw = raw.trim().toLowerCase().replace(/[^a-z]/g, '');

const validPaths = ['k', 'consumer', 'retail'];
const path = validPaths.includes(raw) ? raw : 'k';

let emailData = {};
try { emailData = $('Parse Original Body').first()?.json || {}; }
catch(e) { emailData = {}; }

return [{ json: {
  subject:     emailData.subject     || '',
  from_name:   emailData.from_name   || '',
  from_email:  emailData.from_email  || '',
  body:        emailData.body        || '',
  received_at: emailData.received_at || '',
  path
} }];
