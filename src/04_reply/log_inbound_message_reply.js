// n8n Code node: "Log Inbound Message (Reply)"
// Logs an inbound reply to the conversation history.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const inputData = $input.first().json;
const leadData = inputData?.leadData || {};
const leadId = leadData.id;
const conversationId = leadData.conversation_id;
const messageText = leadData.email_body || '';
const detectedLanguage = leadData.detected_language || 'en';

if (!leadId || !conversationId) {
  return [{ json: inputData }];
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
    direction: 'inbound',
    message_text: messageText,
    detected_language: detectedLanguage
  },
  json: true
});

return [{ json: inputData }];
