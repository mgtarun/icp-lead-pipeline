// n8n Code node: "LLM Generate Reply"
// Generates a grounded reply from retrieved context and thread history.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const inputData = $input.first().json;
const leadData = inputData?.leadData || {};
const context = inputData?.context || '';

function cleanText(text) {
return (text || '')
.split('\n')
.filter(line => !line.trim().startsWith('>'))
.join(' ')
.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
.replace(/\s+/g, ' ')
.trim()
.substring(0, 500);
}

const historyText = cleanText(inputData?.historyText || '');
const latestMessage = cleanText(leadData?.email_body || '');
const cleanContext = cleanText(context);

const prompt = `You are a sales assistant for Lumen Living, a luxury Vietnamese furniture brand.

Write a helpful reply email to the customer's LATEST message below.

Use the conversation history only to understand context.
Use ONLY the product information provided in the Product context.
Never make up prices, dimensions, lead times, finishes, stock status, delivery details, discounts, or commercial terms.

IMPORTANT OUTPUT RULE:

* Return the email body only.
* Do NOT return JSON.
* Do NOT include a subject line.
* Do NOT include explanations about what you are doing.

LANGUAGE RULE:

* Reply in the same language as the detected_language field below.

EMAIL FORMAT RULES:

* Start with: Hi [Customer Name],
* Do NOT start with Dear.
* Use short paragraphs with blank lines between sections.
* Do NOT write the whole reply as one long paragraph.
* Do NOT hard-wrap sentences across multiple lines.
* Use bullet points only when listing multiple finishes, product options, or grouped product details.
* End exactly with:
  Kind regards,
  Lumen Living Team

CONTENT RULES:

* Thank the customer for their interest.
* Address every product the customer asked about by name.
* Never mention products the customer did not ask about.
* Do NOT repeat the same fact twice.
* If price is available and allowed by the pricing rules, mention it once before Product details.
* If dimensions, lead time, delivery location, or preferred delivery time are included, put them only under "Product details:" as bullet points.
* If a requested finish or colour is unavailable but alternatives are available, explain this clearly in one paragraph.
* If there are multiple available finishes, list them as bullet points.
* If required information is missing, politely ask the customer to confirm it.
* Do NOT mention CRM, score, tier, lead quality, internal routing, attribute scores, TP flags, or penalties.

PRICING RULES — CRITICAL:

* Customer path: ${leadData.path}
* If path = 'consumer' → show RETAIL price only. Never mention B2B price, trade price, wholesale price, dealer price, or any discount.
* If path = 'retail' → NEVER show retail price. ONLY quote B2B trade price if available in the context. End by directing them to na.lumenliving.com/pages/b2b-signup.

PREFERRED STRUCTURE FOR CONSUMER:
Hi [Customer Name],

Thank you for your interest in [Product Name]. The retail price for this piece is [Retail Price].

Please note that [Unavailable Finish] is currently unavailable. However, we do have [Product Name] available in the following finishes:

* [Available finish 1]
* [Available finish 2]

Product details:

* Dimensions: [Dimensions]
* Estimated lead time: [Estimated lead time]
* Delivery location: [Delivery location]
* Preferred delivery time: [Preferred delivery time]

Please let us know if you would like to proceed, and we will be happy to confirm the next steps for you.

Kind regards,
Lumen Living Team

PREFERRED STRUCTURE FOR RETAIL:
Hi [Customer Name],

Thank you for your enquiry about [Product Name]. We would be happy to assist with your trade or B2B request.

[Quote B2B trade price only if available. If not available, say we can confirm trade pricing after receiving the required business details.]

Product details:

* Dimensions: [Dimensions]
* Estimated lead time: [Estimated lead time]
* Available finishes: [Available finishes]

To continue with a trade enquiry, please complete the B2B signup form here: na.lumenliving.com/pages/b2b-signup

Kind regards,
Lumen Living Team

IMPORTANT:

* Follow the correct preferred structure based on the customer path.
* Only include information that exists in the Product context.
* Do not include placeholder text such as [Retail Price], [Dimensions], or [Available finish].
* If a section has no available information, omit that section.
* Keep "Product details:" as a separate section if product details exist.
* Keep bullet points on separate lines.

Customer name: ${leadData.sender_name || ''}
Detected language: ${leadData.detected_language || 'en'}
Customer path: ${leadData.path || ''}
Customer city: ${leadData.extracted_city || ''}
Customer district: ${leadData.extracted_district || ''}

Conversation history:
${historyText || 'No previous conversation — this is the first message.'}

Customer's latest message:
${latestMessage}

Product context:
${cleanContext}`;

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
temperature: 0.2,
max_tokens: 700,
seed: 0,
top_p: 1,
messages: [
{
role: 'user',
content: prompt
}
]
},
json: true
});

return [{ json: {
...inputData,
choices: response?.choices
}}];
