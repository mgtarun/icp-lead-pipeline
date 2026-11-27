// n8n Code node: "Fetch Recent Messages"
// Loads the last messages on the thread via get_recent_email_messages.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const inputData = $input.first().json;
const leadData = inputData?.leadData || inputData || {};
const conversationId = leadData.conversation_id || null;

let history = [];

if (conversationId) {
  try {
    const rows = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://YOUR_PROJECT.supabase.co/rest/v1/rpc/get_recent_email_messages',
      headers: {
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: {
        p_conversation_id: conversationId,
        p_limit: 6
      },
      json: true
    });
    history = Array.isArray(rows) ? rows.reverse() : [];
  } catch(e) {
    history = [];
  }
}

const historyText = history.length > 0
  ? history.map(m =>
      `${m.direction === 'inbound' ? 'Customer' : 'System'}: ${m.message_text}`
    ).join('\n\n')
  : 'No previous conversation.';

return [{ json: {
  ...inputData,
  leadData: {
    ...leadData,
    historyText
  },
  historyText
}}];
