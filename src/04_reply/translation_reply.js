// n8n Code node: "Translation reply"
// Translates the reply back into the sender's original language.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const reply = $input.first().json.reply;
const leadData = $input.first().json.leadData;

// Safely try Parse Original Body first (new lead path), fall back to leadData (reply path)
let detectedLanguage = 'en';
try {
  detectedLanguage = $('Parse Original Body').first()?.json?.detected_language 
                  || leadData?.detected_language 
                  || 'en';
} catch (e) {
  detectedLanguage = leadData?.detected_language || 'en';
}

const isEnglish = detectedLanguage === 'en';

if (isEnglish === true || detectedLanguage === 'en') {
  return [{ json: { reply, leadData } }];
}

const langMap = {
  'fr': 'French',
  'it': 'Italian', 
  'vi': 'Vietnamese',
  'de': 'German',
  'es': 'Spanish',
  'zh': 'Chinese',
  'ja': 'Japanese',
  'ko': 'Korean'
};

const targetLanguage = langMap[detectedLanguage] || detectedLanguage;

const response = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  headers: {
    'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
    'Content-Type': 'application/json'
  },
  body: {
    model: 'llama-3.3-70b-versatile',
    temperature: 0,
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Translate the following email reply into ${targetLanguage}. Keep the same professional tone, formatting, and meaning. Return ONLY the translated text, nothing else.\n\n${reply}`
    }]
  },
  json: true
});

const translatedReply = response.choices[0].message.content;
return [{ json: { reply: translatedReply, leadData } }];
