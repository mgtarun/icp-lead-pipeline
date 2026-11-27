// n8n Code node: "Spam Check"
// Fast keyword based spam filter that runs before the LLM spam check.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const subject = ($input.first().json.subject || '').toLowerCase();
const body = ($input.first().json.body || '').toLowerCase();
const email = ($input.first().json.from_email || '').toLowerCase();

const spamSignals = [
  email.includes('noreply'),
  email.includes('no-reply'),
  email.includes('mailer-daemon'),
  email.includes('donotreply'),
  body.includes('unsubscribe'),
  body.includes('click here to win'),
  body.includes('you have been selected'),
  body.includes('congratulations you won'),
  body.includes('free gift'),
  body.includes('limited time offer'),
  body.includes('act now'),
  body.length < 15,
  subject.includes('re: re: re:'),
];

const spamScore = spamSignals.filter(Boolean).length;
const is_spam = spamScore >= 2;

return [{ json: {
  ...$input.first().json,
  is_spam,
  spam_score: spamScore
} }];
