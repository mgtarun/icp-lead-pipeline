// n8n Code node: "Rewrite Query"
// Rewrites the latest message plus history into a standalone search query for RAG.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const inputData = $input.first().json;
const leadData = inputData?.leadData || {};

// Clean the text — strip control chars, quoted reply lines (>), and limit length
function cleanText(text) {
  return (text || '')
    .split('\n')
    .filter(line => !line.trim().startsWith('>'))  // remove quoted reply lines
    .join(' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // remove control chars
    .replace(/\s+/g, ' ')  // normalize whitespace
    .trim()
    .substring(0, 300);
}

const historyText = cleanText(inputData?.historyText || '');
const latestMessage = cleanText(leadData?.email_body || '');

const response = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  headers: {
    'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
    'Content-Type': 'application/json'
  },
  body: {
    model: 'llama-3.3-70b-versatile',
    stream: false,
    temperature: 0,
    max_tokens: 50,
    messages: [
      {
        role: 'system',
        content: 'You rewrite a customer\'s most recent message into a self-contained English search query for a furniture product database.\n\nRULES:\n- Output ONLY the rewritten query. No quotes, no preamble, no explanations.\n- ALWAYS output something. Never refuse.\n- If the message is already self-contained (mentions a product name or asks a clear question), output it UNCHANGED.\n- If the message uses a pronoun or follow-up ("how much?", "in walnut?", "that one", "it"), resolve it using the conversation history.\n- Keep the output short — under 20 words.\n- Output in English.'
      },
      {
        role: 'user',
        content: 'Conversation history:\n' + historyText + '\n\nMost recent message:\n' + latestMessage
      }
    ]
  },
  json: true
});

const rewrittenQuery = response?.choices?.[0]?.message?.content || latestMessage;

return [{ json: {
  ...inputData,
  rewrittenQuery,
  choices: response?.choices
}}];
