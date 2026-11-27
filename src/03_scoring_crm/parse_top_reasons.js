// n8n Code node: "Parse Top Reasons"
// Picks the top reasons to show on the CRM task.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const item = $input.first().json;

let reasons = item.top_reasons;
if (typeof reasons === 'string') {
  try { reasons = JSON.parse(reasons); } catch(e) { reasons = []; }
}
reasons = Array.isArray(reasons) ? reasons : [];

return [{
  json: {
    ...item,
    top_reasons: reasons
  }
}];
