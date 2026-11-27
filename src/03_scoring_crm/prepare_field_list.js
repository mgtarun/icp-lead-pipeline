// n8n Code node: "Prepare Field List"
// Builds the list of Twenty CRM custom fields to create if missing.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const response = $input.first().json;

// Parse GraphQL response for task object
const edges = response.data?.objects?.edges || [];
let taskObjectId = null;
for (const edge of edges) {
  const obj = edge.node || edge;
  if (obj.nameSingular === 'task') {
    taskObjectId = obj.id;
    break;
  }
}

if (!taskObjectId) {
  return [{ json: { error: 'Task object not found', response: JSON.stringify(response).substring(0, 500) } }];
}

const textFields = [
  'senderName', 'senderEmail', 'companyName', 'useCase',
  'budgetSignal', 'timelineSignal', 'teamSize', 'urgency',
  'leadScore', 'leadConfidence', 'recommendation', 'reviewerNote',
];

// Output each field as a GraphQL mutation
const items = textFields.map(name => ({
  json: {
    query: `mutation { createOneField(input: { field: { name: "${name}", label: "${name.replace(/([A-Z])/g, ' $1').trim()}", type: TEXT, objectMetadataId: "${taskObjectId}" } }) { id name } }`
  }
}));

// Add reviewDecision SELECT
items.push({
  json: {
    query: `mutation { createOneField(input: { field: { name: "reviewDecision", label: "Review Decision", type: SELECT, objectMetadataId: "${taskObjectId}", defaultValue: "'PENDING'", options: [{ label: "Pending", value: "PENDING", color: "gray", position: 0 }, { label: "Approved", value: "APPROVED", color: "green", position: 1 }, { label: "Rejected", value: "REJECTED", color: "red", position: 2 }, { label: "Overridden", value: "OVERRIDDEN", color: "yellow", position: 3 }] } }) { id name } }`
  }
});

return items;
