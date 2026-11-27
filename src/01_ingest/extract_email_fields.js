// n8n Code node: "Extract Email Fields"
// Normalises the Gmail trigger output into sender, subject, body and thread id.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

// Extract email fields from Gmail Trigger output
const item = $input.first().json;

const subject = item.subject || item.headers?.subject || '';

// Gmail returns 'from' as object {address, name}, array, or string
const fromField = item.from;
let from_name = '';
let from_email = '';

if (Array.isArray(fromField)) {
  from_name = fromField[0]?.name || '';
  from_email = fromField[0]?.address || '';
} else if (typeof fromField === 'object' && fromField !== null) {
  from_name = fromField.name || '';
  from_email = fromField.address || '';
} else if (typeof fromField === 'string') {
  const match = fromField.match(/<(.+?)>/);
  if (match) {
    from_email = match[1];
    from_name = fromField.replace(/<.+?>/, '').replace(/"/g, '').trim();
  } else {
    from_email = fromField.trim();
  }
}

// Get body and sanitize for JSON safety
let body = item.textPlain || item.text || item.snippet || item.body || '';
if (!body && item.html) { body = item.html.replace(/<[^>]*>/g, ' '); }
body = body.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
body = body.replace(/[\x00-\x1F\x7F]/g, '');
body = body.replace(/\s+/g, ' ').trim();

const received_at = item.date || item.internalDate || new Date().toISOString();

return [{ json: { subject, from_name, from_email, body, received_at } }];
