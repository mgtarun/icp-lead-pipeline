// n8n Code node: "Update Existing Lead"
// Merges new info from a reply into the existing lead row.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const leadId = $json.existing_lead_id;
const conversationId = $json.threadId;
const newMessage = $json.body || '';
const newSubject = $json.subject || '';
const timestamp = new Date().toISOString();

// Update the lead row to flag customer replied
await this.helpers.httpRequest({
  method: 'PATCH',
  url: `https://YOUR_PROJECT.supabase.co/rest/v1/crm_leads?id=eq.${leadId}`,
  headers: {
    'apikey': process.env.SUPABASE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: {
    customer_replied: true,
    email_body: newMessage,
    email_subject: newSubject,
    updated_at: timestamp
  },
  json: true
});

return [{ json: {
  leadData: {
    id: leadId,
    path: $json.existing_path,
    pricing_tier: $json.existing_pricing_tier,
    extracted_city: $json.existing_city,
    detected_language: $json.existing_language,
    email_body: newMessage,
    original_body: newMessage,
    email_subject: newSubject,
    conversation_id: conversationId,
    sender_name: $json.from_name || '',
    sender_email: $json.from_email || '',
    product_requested: ''
  }
}}];
