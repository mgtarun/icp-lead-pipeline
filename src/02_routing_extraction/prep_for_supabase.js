// n8n Code node: "Prep for Supabase"
// Shapes the mapped fields into the crm_leads insert payload.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const item = $input.first().json;
return [{ json: {
  ...item,
  team_size:          item.team_size ? parseInt(item.team_size, 10) : null,
  store_count:        item.store_count ? parseInt(item.store_count, 10) : null,
  stated_revenue_aud: item.stated_revenue_aud ? parseInt(item.stated_revenue_aud, 10) : null,
  fields_inferred:    item.fields_inferred ? parseInt(item.fields_inferred, 10) : 0,
  price_shopping:     item.price_shopping === 'true' || item.price_shopping === true,
  cannot_influence:   item.cannot_influence_decision === 'true' || item.cannot_influence_decision === true,
  created_at:         new Date().toISOString()
} }];
