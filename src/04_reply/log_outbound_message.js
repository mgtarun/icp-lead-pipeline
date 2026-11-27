// n8n Code node: "Log Outbound Message"
// Logs the outgoing reply to the conversation history.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const reply = $input.first().json.reply || '';
const leadData = $input.first().json.leadData || {};
const leadId = leadData.id;
const conversationId = leadData.conversation_id;

if (!leadId || !conversationId) {
  return [{ json: $input.first().json }];
}

await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://YOUR_PROJECT.supabase.co/rest/v1/crm_email_messages',
  headers: {
    'apikey': process.env.SUPABASE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
    'Content-Type': 'application/json'
  },
  body: {
    lead_id: leadId,
    conversation_id: conversationId,
    channel: 'email',
    direction: 'outbound',
    message_text: reply,
    detected_language: leadData.detected_language || 'en'
  },
  json: true
});

return [{ json: $input.first().json }];
