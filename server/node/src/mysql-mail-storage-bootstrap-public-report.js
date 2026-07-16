"use strict";

const SAFE_PATH_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:(?:\[[0-9]+\])|(?:\.[A-Za-z][A-Za-z0-9_]*))*$/;
const PUBLIC_PATH_PATTERNS = Object.freeze([
  /^certifyAttachment$/,
  /^plan$/,
  /^sourceRows$/,
  /^sourceRows\[[0-9]+\](?:\.(?:mail_id|sender_account_id|recipient_account_id|title|created_at|read_at|document_json))?$/,
  /^observed(?:\.(?:control|identityRows|counterRows|archiveRows|vaultRows|mailId|recipientAccountId))?$/,
]);
const PUBLIC_FACT_CODES = new Set([
  "equipment_instance_serial_exhausted",
  "equipment_transfer_backpack_full",
  "equipment_transfer_backpack_invalid",
  "equipment_transfer_capacity_config_invalid",
  "equipment_transfer_envelope_batch_invalid",
  "equipment_transfer_envelope_duplicate",
  "equipment_transfer_envelope_field_unknown",
  "equipment_transfer_envelope_id_invalid",
  "equipment_transfer_envelope_invalid",
  "equipment_transfer_envelope_replay",
  "equipment_transfer_envelope_schema_future",
  "equipment_transfer_envelope_schema_invalid",
  "equipment_transfer_envelope_untrusted",
  "equipment_transfer_export_invariant_failed",
  "equipment_transfer_fingerprint_mismatch",
  "equipment_transfer_identity_embedded",
  "equipment_transfer_import_invariant_failed",
  "equipment_transfer_instance_identity_conflict",
  "equipment_transfer_instance_schema_future",
  "equipment_transfer_instance_schema_invalid",
  "equipment_transfer_instance_selection_invalid",
  "equipment_transfer_instance_selection_required",
  "equipment_transfer_instance_state_invalid",
  "equipment_transfer_item_invalid",
  "equipment_transfer_json_unsafe",
  "equipment_transfer_provenance_invalid",
  "equipment_transfer_source_conflict",
  "equipment_transfer_source_slot_invalid",
  "equipment_transfer_source_slot_mismatch",
  "equipment_transfer_target_conflict",
  "equipment_transfer_template_missing",
  "mail_currency_invalid",
  "mail_currency_unknown",
  "mail_authority_changes_invalid",
  "mail_authority_commit_conflict",
  "mail_authority_container_invalid",
  "mail_authority_document_invalid",
  "mail_authority_identity_invalid",
  "mail_authority_rebase_conflict",
  "mail_authority_recipient_invalid",
  "mail_authority_state_invalid",
  "mail_claim_envelope_missing",
  "mail_claim_equipment_envelope_required",
  "mail_claim_invalid",
  "mail_claim_item_not_enough",
  "mail_equipment_summary_mismatch",
  "mail_equipment_transfer_unsupported",
  "mail_item_invalid",
  "mail_item_unknown",
  "mail_lifecycle_asset_conflict",
  "mail_lifecycle_assets_remaining",
  "mail_lifecycle_assets_unverified",
  "mail_lifecycle_created_at_invalid",
  "mail_lifecycle_invalid",
  "mail_lifecycle_read_at_invalid",
  "mail_lifecycle_settled_at_invalid",
  "mail_representation_conflict",
  "mail_root_invalid",
  "mail_schema_future",
  "mail_schema_invalid",
  "mail_schema_unsupported",
  "mail_storage_bootstrap_archive_unexpected",
  "mail_storage_bootstrap_attachment_certifier_failed",
  "mail_storage_bootstrap_attachment_certifier_missing",
  "mail_storage_bootstrap_attachment_invalid",
  "mail_storage_bootstrap_control_conflict",
  "mail_storage_bootstrap_counter_conflict",
  "mail_storage_bootstrap_counter_duplicate",
  "mail_storage_bootstrap_counter_unexpected",
  "mail_storage_bootstrap_document_json_invalid",
  "mail_storage_bootstrap_identity_conflict",
  "mail_storage_bootstrap_identity_duplicate",
  "mail_storage_bootstrap_identity_invalid",
  "mail_storage_bootstrap_identity_unexpected",
  "mail_storage_bootstrap_invalid",
  "mail_storage_bootstrap_mail_duplicate",
  "mail_storage_bootstrap_observed_invalid",
  "mail_storage_bootstrap_physical_row_invalid",
  "mail_storage_bootstrap_plan_certifier_missing",
  "mail_storage_bootstrap_plan_counts_invalid",
  "mail_storage_bootstrap_plan_digest_mismatch",
  "mail_storage_bootstrap_plan_invalid",
  "mail_storage_bootstrap_plan_projection_mismatch",
  "mail_storage_bootstrap_plan_source_certification_failed",
  "mail_storage_bootstrap_plan_source_changed",
  "mail_storage_bootstrap_plan_source_digest_mismatch",
  "mail_storage_bootstrap_plan_source_invalid",
  "mail_storage_bootstrap_ready_incomplete",
  "mail_storage_bootstrap_row_mirror_invalid",
  "mail_storage_bootstrap_source_invalid",
  "mail_storage_bootstrap_uninitialized_not_empty",
  "mail_storage_bootstrap_vault_unexpected",
]);

function redactMailStorageBootstrapFact(value) {
  const fact = isObject(value) ? value : {};
  const code = String(fact.code || "");
  const path = String(fact.path || "");
  return Object.freeze({
    code: PUBLIC_FACT_CODES.has(code) ? code : "mail_storage_bootstrap_invalid",
    path: publicPath(path) ? path : "",
  });
}

function publicPath(path) {
  return path !== ""
    && path.length <= 180
    && SAFE_PATH_PATTERN.test(path)
    && PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  redactMailStorageBootstrapFact,
};
