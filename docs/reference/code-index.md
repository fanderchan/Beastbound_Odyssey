# 代码、数据与工具索引

> 自动生成：`node tools/repository_guide.mjs refresh`。请修改源文件，不手改此页。

只统计当前工作区 Git 可见的代码与共享 JSON（含未提交文件），排除忽略文件、缓存和美术制作档案。存在不代表已提交、已测试或已发布。

共 **956** 个代码/测试文件、**88** 个共享 JSON。职责与修改路线见 [架构说明](../architecture.md)，阶段背景见 [阶段索引](phase-index.md)。

## 大文件定位

行数用于定位阅读成本，不是质量评分。拆分候选与验证要求见 [维护清单](../maintenance.md)。

| 行数 | 文件 |
| ---: | --- |
| 33024 | [client/godot/scripts/qa/auto_check_coordinator.gd](../../client/godot/scripts/qa/auto_check_coordinator.gd) |
| 28889 | [client/godot/scripts/ui/panel_flow_coordinator.gd](../../client/godot/scripts/ui/panel_flow_coordinator.gd) |
| 27376 | [server/node/src/auth-service.js](../../server/node/src/auth-service.js) |
| 19231 | [client/godot/scripts/main.gd](../../client/godot/scripts/main.gd) |
| 9250 | [server/node/src/mysql-store.js](../../server/node/src/mysql-store.js) |
| 8834 | [client/godot/scripts/progression/player_progress_model.gd](../../client/godot/scripts/progression/player_progress_model.gd) |
| 8789 | [tools/build_pet_portrait.py](../../tools/build_pet_portrait.py) |
| 7617 | [tools/p0_6_public_capacity_soak.mjs](../../tools/p0_6_public_capacity_soak.mjs) |
| 5937 | [server/node/test/auth-battle-room.test.js](../../server/node/test/auth-battle-room.test.js) |
| 5575 | [tools/p0_6d_profile_parallel_mysql_gate.mjs](../../tools/p0_6d_profile_parallel_mysql_gate.mjs) |
| 5412 | [tools/run_pet_battle_export_gate.py](../../tools/run_pet_battle_export_gate.py) |
| 5008 | [tools/audit_pet_portrait_catalog.py](../../tools/audit_pet_portrait_catalog.py) |
| 4927 | [tools/test/test_pet_battle_export_gate.py](../../tools/test/test_pet_battle_export_gate.py) |
| 4718 | [tools/test/test_build_pet_portrait.py](../../tools/test/test_build_pet_portrait.py) |
| 4698 | [tools/record_map_visual_action_captures.py](../../tools/record_map_visual_action_captures.py) |

## client/godot/scripts

<details><summary>1 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [main.gd](../../client/godot/scripts/main.gd) | 19231 |

</details>

## client/godot/scripts/audio

<details><summary>11 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [audio_impact_review_model.gd](../../client/godot/scripts/audio/audio_impact_review_model.gd) | 785 |
| [audio_impact_review_model_check.gd](../../client/godot/scripts/audio/audio_impact_review_model_check.gd) | 232 |
| [audio_music_review_model.gd](../../client/godot/scripts/audio/audio_music_review_model.gd) | 347 |
| [audio_music_review_model_check.gd](../../client/godot/scripts/audio/audio_music_review_model_check.gd) | 104 |
| [battle_audio_cue_model.gd](../../client/godot/scripts/audio/battle_audio_cue_model.gd) | 1062 |
| [battle_audio_cue_model_check.gd](../../client/godot/scripts/audio/battle_audio_cue_model_check.gd) | 760 |
| [battle_audio_timeline_controller.gd](../../client/godot/scripts/audio/battle_audio_timeline_controller.gd) | 108 |
| [battle_audio_timeline_controller_check.gd](../../client/godot/scripts/audio/battle_audio_timeline_controller_check.gd) | 191 |
| [game_audio_manager.gd](../../client/godot/scripts/audio/game_audio_manager.gd) | 1332 |
| [game_audio_manager_check.gd](../../client/godot/scripts/audio/game_audio_manager_check.gd) | 740 |
| [world_audio_context_model.gd](../../client/godot/scripts/audio/world_audio_context_model.gd) | 58 |

</details>

## client/godot/scripts/battle

<details><summary>38 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [battle_action_catalog.gd](../../client/godot/scripts/battle/battle_action_catalog.gd) | 563 |
| [battle_arena_visual_catalog.gd](../../client/godot/scripts/battle/battle_arena_visual_catalog.gd) | 298 |
| [battle_capture_capacity_model.gd](../../client/godot/scripts/battle/battle_capture_capacity_model.gd) | 117 |
| [battle_draw_order.gd](../../client/godot/scripts/battle/battle_draw_order.gd) | 24 |
| [battle_draw_order_check.gd](../../client/godot/scripts/battle/battle_draw_order_check.gd) | 50 |
| [battle_element_tactics_model.gd](../../client/godot/scripts/battle/battle_element_tactics_model.gd) | 176 |
| [battle_event_ledger.gd](../../client/godot/scripts/battle/battle_event_ledger.gd) | 221 |
| [battle_layout_constants.gd](../../client/godot/scripts/battle/battle_layout_constants.gd) | 10 |
| [battle_layout_safe_area_model.gd](../../client/godot/scripts/battle/battle_layout_safe_area_model.gd) | 391 |
| [battle_layout_safe_area_model_check.gd](../../client/godot/scripts/battle/battle_layout_safe_area_model_check.gd) | 393 |
| [battle_model.gd](../../client/godot/scripts/battle/battle_model.gd) | 4438 |
| [battle_passive_catalog.gd](../../client/godot/scripts/battle/battle_passive_catalog.gd) | 309 |
| [battle_pet_switch_tactics_model.gd](../../client/godot/scripts/battle/battle_pet_switch_tactics_model.gd) | 119 |
| [battle_ranged_projectile_asset_catalog.gd](../../client/godot/scripts/battle/battle_ranged_projectile_asset_catalog.gd) | 105 |
| [battle_ranged_projectile_presentation_model.gd](../../client/godot/scripts/battle/battle_ranged_projectile_presentation_model.gd) | 332 |
| [battle_ranged_projectile_renderer.gd](../../client/godot/scripts/battle/battle_ranged_projectile_renderer.gd) | 664 |
| [battle_skill_feedback_asset_catalog.gd](../../client/godot/scripts/battle/battle_skill_feedback_asset_catalog.gd) | 510 |
| [battle_skill_feedback_presentation_model.gd](../../client/godot/scripts/battle/battle_skill_feedback_presentation_model.gd) | 246 |
| [battle_skill_feedback_renderer.gd](../../client/godot/scripts/battle/battle_skill_feedback_renderer.gd) | 848 |
| [battle_spectator_ai_model.gd](../../client/godot/scripts/battle/battle_spectator_ai_model.gd) | 538 |
| [battle_status_model.gd](../../client/godot/scripts/battle/battle_status_model.gd) | 170 |
| [battle_texture_prefetch_check.gd](../../client/godot/scripts/battle/battle_texture_prefetch_check.gd) | 204 |
| [battle_texture_prefetch_plan.gd](../../client/godot/scripts/battle/battle_texture_prefetch_plan.gd) | 71 |
| [battle_texture_prefetcher.gd](../../client/godot/scripts/battle/battle_texture_prefetcher.gd) | 147 |
| [battle_visual_presentation_model.gd](../../client/godot/scripts/battle/battle_visual_presentation_model.gd) | 308 |
| [capture_tool_catalog.gd](../../client/godot/scripts/battle/capture_tool_catalog.gd) | 195 |
| [mounted_battle_presentation_model.gd](../../client/godot/scripts/battle/mounted_battle_presentation_model.gd) | 118 |
| [pet_battle_review_model.gd](../../client/godot/scripts/battle/pet_battle_review_model.gd) | 1356 |
| [pet_template_catalog.gd](../../client/godot/scripts/battle/pet_template_catalog.gd) | 518 |
| [server_battle_boss_replay_check.gd](../../client/godot/scripts/battle/server_battle_boss_replay_check.gd) | 491 |
| [server_battle_command_owner_check.gd](../../client/godot/scripts/battle/server_battle_command_owner_check.gd) | 96 |
| [server_battle_coordinator.gd](../../client/godot/scripts/battle/server_battle_coordinator.gd) | 1448 |
| [server_battle_interruption_model.gd](../../client/godot/scripts/battle/server_battle_interruption_model.gd) | 129 |
| [server_battle_reaction_replay_check.gd](../../client/godot/scripts/battle/server_battle_reaction_replay_check.gd) | 679 |
| [server_battle_request_owner_check.gd](../../client/godot/scripts/battle/server_battle_request_owner_check.gd) | 94 |
| [server_battle_ride_replay_check.gd](../../client/godot/scripts/battle/server_battle_ride_replay_check.gd) | 774 |
| [server_battle_room_model.gd](../../client/godot/scripts/battle/server_battle_room_model.gd) | 1611 |
| [server_battle_status_replay_check.gd](../../client/godot/scripts/battle/server_battle_status_replay_check.gd) | 655 |

</details>

## client/godot/scripts/net

<details><summary>9 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [character_entry_coordinator.gd](../../client/godot/scripts/net/character_entry_coordinator.gd) | 337 |
| [hang_matchmaking_client_check.gd](../../client/godot/scripts/net/hang_matchmaking_client_check.gd) | 15 |
| [hang_matchmaking_client_model.gd](../../client/godot/scripts/net/hang_matchmaking_client_model.gd) | 996 |
| [hang_matchmaking_controller.gd](../../client/godot/scripts/net/hang_matchmaking_controller.gd) | 168 |
| [idempotent_http_retry_state.gd](../../client/godot/scripts/net/idempotent_http_retry_state.gd) | 104 |
| [online_presence_cache_model.gd](../../client/godot/scripts/net/online_presence_cache_model.gd) | 665 |
| [server_event_clock_check.gd](../../client/godot/scripts/net/server_event_clock_check.gd) | 79 |
| [server_event_reconnect_model.gd](../../client/godot/scripts/net/server_event_reconnect_model.gd) | 186 |
| [server_sync_coordinator.gd](../../client/godot/scripts/net/server_sync_coordinator.gd) | 796 |

</details>

## client/godot/scripts/pet

<details><summary>8 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [pet.gd](../../client/godot/scripts/pet/pet.gd) | 227 |
| [pet_action_asset_catalog.gd](../../client/godot/scripts/pet/pet_action_asset_catalog.gd) | 707 |
| [pet_animation_cache_check.gd](../../client/godot/scripts/pet/pet_animation_cache_check.gd) | 75 |
| [pet_art_catalog.gd](../../client/godot/scripts/pet/pet_art_catalog.gd) | 350 |
| [pet_battle_release_gate.gd](../../client/godot/scripts/pet/pet_battle_release_gate.gd) | 789 |
| [pet_battle_sprite_scale_catalog.gd](../../client/godot/scripts/pet/pet_battle_sprite_scale_catalog.gd) | 305 |
| [pet_evolution_visual_catalog.gd](../../client/godot/scripts/pet/pet_evolution_visual_catalog.gd) | 294 |
| [standalone_pet_art_overlay.gd](../../client/godot/scripts/pet/standalone_pet_art_overlay.gd) | 701 |

</details>

## client/godot/scripts/player

<details><summary>6 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [character_action_asset_catalog.gd](../../client/godot/scripts/player/character_action_asset_catalog.gd) | 742 |
| [mount_visual_profile_catalog.gd](../../client/godot/scripts/player/mount_visual_profile_catalog.gd) | 253 |
| [mounted_character_2d.gd](../../client/godot/scripts/player/mounted_character_2d.gd) | 81 |
| [mounted_character_asset_catalog.gd](../../client/godot/scripts/player/mounted_character_asset_catalog.gd) | 549 |
| [player.gd](../../client/godot/scripts/player/player.gd) | 684 |
| [player_appearance_catalog.gd](../../client/godot/scripts/player/player_appearance_catalog.gd) | 103 |

</details>

## client/godot/scripts/progression

<details><summary>92 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [account_auth_model.gd](../../client/godot/scripts/progression/account_auth_model.gd) | 221 |
| [auto_battle_settings_model.gd](../../client/godot/scripts/progression/auto_battle_settings_model.gd) | 263 |
| [auto_capture_filter_model.gd](../../client/godot/scripts/progression/auto_capture_filter_model.gd) | 347 |
| [auto_capture_settings_model.gd](../../client/godot/scripts/progression/auto_capture_settings_model.gd) | 184 |
| [backpack_model.gd](../../client/godot/scripts/progression/backpack_model.gd) | 722 |
| [balance_catalog_model.gd](../../client/godot/scripts/progression/balance_catalog_model.gd) | 1345 |
| [bank_profile_model.gd](../../client/godot/scripts/progression/bank_profile_model.gd) | 352 |
| [battle_result_receipt_model.gd](../../client/godot/scripts/progression/battle_result_receipt_model.gd) | 255 |
| [battle_reward_catalog.gd](../../client/godot/scripts/progression/battle_reward_catalog.gd) | 177 |
| [character_creation_model.gd](../../client/godot/scripts/progression/character_creation_model.gd) | 172 |
| [character_creation_model_check.gd](../../client/godot/scripts/progression/character_creation_model_check.gd) | 183 |
| [character_name_policy_model.gd](../../client/godot/scripts/progression/character_name_policy_model.gd) | 199 |
| [character_roster_model.gd](../../client/godot/scripts/progression/character_roster_model.gd) | 515 |
| [character_roster_model_check.gd](../../client/godot/scripts/progression/character_roster_model_check.gd) | 205 |
| [combat_formula_candidate_model.gd](../../client/godot/scripts/progression/combat_formula_candidate_model.gd) | 329 |
| [combat_formula_driver_ab_model.gd](../../client/godot/scripts/progression/combat_formula_driver_ab_model.gd) | 218 |
| [combat_formula_model.gd](../../client/godot/scripts/progression/combat_formula_model.gd) | 291 |
| [combat_formula_shadow_model.gd](../../client/godot/scripts/progression/combat_formula_shadow_model.gd) | 319 |
| [currency_wallet_model.gd](../../client/godot/scripts/progression/currency_wallet_model.gd) | 83 |
| [equipment_escrow_client_model.gd](../../client/godot/scripts/progression/equipment_escrow_client_model.gd) | 578 |
| [equipment_exact_instance_check.gd](../../client/godot/scripts/progression/equipment_exact_instance_check.gd) | 270 |
| [equipment_model.gd](../../client/godot/scripts/progression/equipment_model.gd) | 382 |
| [equipment_synthesis_model.gd](../../client/godot/scripts/progression/equipment_synthesis_model.gd) | 130 |
| [gm_pet_capture_recovery_client_model.gd](../../client/godot/scripts/progression/gm_pet_capture_recovery_client_model.gd) | 256 |
| [gm_pet_evolution_qa_client_model.gd](../../client/godot/scripts/progression/gm_pet_evolution_qa_client_model.gd) | 444 |
| [gm_pet_paid_reset_qa_client_model.gd](../../client/godot/scripts/progression/gm_pet_paid_reset_qa_client_model.gd) | 353 |
| [gm_qa_access_policy_model.gd](../../client/godot/scripts/progression/gm_qa_access_policy_model.gd) | 212 |
| [gm_qa_assets_client_model.gd](../../client/godot/scripts/progression/gm_qa_assets_client_model.gd) | 172 |
| [gm_qa_pet_samples_client_model.gd](../../client/godot/scripts/progression/gm_qa_pet_samples_client_model.gd) | 152 |
| [gm_qa_profile_client_model.gd](../../client/godot/scripts/progression/gm_qa_profile_client_model.gd) | 131 |
| [gm_tool_plugin_model.gd](../../client/godot/scripts/progression/gm_tool_plugin_model.gd) | 171 |
| [gm_tool_runtime_model.gd](../../client/godot/scripts/progression/gm_tool_runtime_model.gd) | 158 |
| [hang_settings_model.gd](../../client/godot/scripts/progression/hang_settings_model.gd) | 151 |
| [mail_center_model.gd](../../client/godot/scripts/progression/mail_center_model.gd) | 325 |
| [mailbox_page_model.gd](../../client/godot/scripts/progression/mailbox_page_model.gd) | 254 |
| [numeric_balance_gate_model.gd](../../client/godot/scripts/progression/numeric_balance_gate_model.gd) | 359 |
| [numeric_battle_simulator_model.gd](../../client/godot/scripts/progression/numeric_battle_simulator_model.gd) | 507 |
| [numeric_economy_ledger_model.gd](../../client/godot/scripts/progression/numeric_economy_ledger_model.gd) | 325 |
| [numeric_experiment_model.gd](../../client/godot/scripts/progression/numeric_experiment_model.gd) | 838 |
| [numeric_workbench_model.gd](../../client/godot/scripts/progression/numeric_workbench_model.gd) | 662 |
| [offline_hang_client_model.gd](../../client/godot/scripts/progression/offline_hang_client_model.gd) | 67 |
| [pet_cultivation_model.gd](../../client/godot/scripts/progression/pet_cultivation_model.gd) | 210 |
| [pet_evolution_balance_model.gd](../../client/godot/scripts/progression/pet_evolution_balance_model.gd) | 230 |
| [pet_evolution_client_model.gd](../../client/godot/scripts/progression/pet_evolution_client_model.gd) | 443 |
| [pet_evolution_presentation_model.gd](../../client/godot/scripts/progression/pet_evolution_presentation_model.gd) | 203 |
| [pet_evolution_release_attestation_model.gd](../../client/godot/scripts/progression/pet_evolution_release_attestation_model.gd) | 314 |
| [pet_evolution_route_catalog_model.gd](../../client/godot/scripts/progression/pet_evolution_route_catalog_model.gd) | 378 |
| [pet_fusion_client_domain_check.gd](../../client/godot/scripts/progression/pet_fusion_client_domain_check.gd) | 1175 |
| [pet_fusion_client_model.gd](../../client/godot/scripts/progression/pet_fusion_client_model.gd) | 675 |
| [pet_fusion_contract_check.gd](../../client/godot/scripts/progression/pet_fusion_contract_check.gd) | 1062 |
| [pet_fusion_outcome_model.gd](../../client/godot/scripts/progression/pet_fusion_outcome_model.gd) | 277 |
| [pet_fusion_outcome_model_check.gd](../../client/godot/scripts/progression/pet_fusion_outcome_model_check.gd) | 201 |
| [pet_fusion_presentation_model.gd](../../client/godot/scripts/progression/pet_fusion_presentation_model.gd) | 249 |
| [pet_fusion_recipe_catalog_model.gd](../../client/godot/scripts/progression/pet_fusion_recipe_catalog_model.gd) | 916 |
| [pet_fusion_release_attestation_model.gd](../../client/godot/scripts/progression/pet_fusion_release_attestation_model.gd) | 1140 |
| [pet_fusion_selection_model.gd](../../client/godot/scripts/progression/pet_fusion_selection_model.gd) | 465 |
| [pet_fusion_skill_policy_check.gd](../../client/godot/scripts/progression/pet_fusion_skill_policy_check.gd) | 575 |
| [pet_fusion_skill_policy_model.gd](../../client/godot/scripts/progression/pet_fusion_skill_policy_model.gd) | 214 |
| [pet_growth_authority_model.gd](../../client/godot/scripts/progression/pet_growth_authority_model.gd) | 509 |
| [pet_growth_manual_evaluation_model.gd](../../client/godot/scripts/progression/pet_growth_manual_evaluation_model.gd) | 261 |
| [pet_growth_observation_model.gd](../../client/godot/scripts/progression/pet_growth_observation_model.gd) | 1417 |
| [pet_growth_public_projection_model.gd](../../client/godot/scripts/progression/pet_growth_public_projection_model.gd) | 814 |
| [pet_growth_quality_model.gd](../../client/godot/scripts/progression/pet_growth_quality_model.gd) | 486 |
| [pet_growth_rule_preview_model.gd](../../client/godot/scripts/progression/pet_growth_rule_preview_model.gd) | 334 |
| [pet_growth_screening_model.gd](../../client/godot/scripts/progression/pet_growth_screening_model.gd) | 284 |
| [pet_growth_species_simulation_model.gd](../../client/godot/scripts/progression/pet_growth_species_simulation_model.gd) | 604 |
| [pet_individual_growth_model.gd](../../client/godot/scripts/progression/pet_individual_growth_model.gd) | 241 |
| [pet_level_one_percentile_model.gd](../../client/godot/scripts/progression/pet_level_one_percentile_model.gd) | 271 |
| [pet_paid_reset_client_model.gd](../../client/godot/scripts/progression/pet_paid_reset_client_model.gd) | 349 |
| [pet_power_model.gd](../../client/godot/scripts/progression/pet_power_model.gd) | 39 |
| [pet_rebirth_mm_model.gd](../../client/godot/scripts/progression/pet_rebirth_mm_model.gd) | 638 |
| [pet_related_item_portrait_model.gd](../../client/godot/scripts/progression/pet_related_item_portrait_model.gd) | 77 |
| [pet_ride_permit_model.gd](../../client/godot/scripts/progression/pet_ride_permit_model.gd) | 109 |
| [pet_skill_presentation_model.gd](../../client/godot/scripts/progression/pet_skill_presentation_model.gd) | 548 |
| [pet_skill_training_model.gd](../../client/godot/scripts/progression/pet_skill_training_model.gd) | 162 |
| [pet_tame_permit_model.gd](../../client/godot/scripts/progression/pet_tame_permit_model.gd) | 119 |
| [pet_terminal_path_model.gd](../../client/godot/scripts/progression/pet_terminal_path_model.gd) | 89 |
| [player_growth_model.gd](../../client/godot/scripts/progression/player_growth_model.gd) | 175 |
| [player_progress_model.gd](../../client/godot/scripts/progression/player_progress_model.gd) | 8834 |
| [quest_matchmaking_objective_check.gd](../../client/godot/scripts/progression/quest_matchmaking_objective_check.gd) | 128 |
| [quest_model.gd](../../client/godot/scripts/progression/quest_model.gd) | 988 |
| [rebirth_model.gd](../../client/godot/scripts/progression/rebirth_model.gd) | 303 |
| [rebirth_trial_model.gd](../../client/godot/scripts/progression/rebirth_trial_model.gd) | 346 |
| [server_auth_client_model.gd](../../client/godot/scripts/progression/server_auth_client_model.gd) | 2677 |
| [server_auth_contract_model.gd](../../client/godot/scripts/progression/server_auth_contract_model.gd) | 236 |
| [server_capture_feedback_model.gd](../../client/godot/scripts/progression/server_capture_feedback_model.gd) | 292 |
| [server_pet_profile_projection_model.gd](../../client/godot/scripts/progression/server_pet_profile_projection_model.gd) | 465 |
| [server_profile_cache_model.gd](../../client/godot/scripts/progression/server_profile_cache_model.gd) | 600 |
| [server_profile_contract_model.gd](../../client/godot/scripts/progression/server_profile_contract_model.gd) | 277 |
| [shop_catalog_model.gd](../../client/godot/scripts/progression/shop_catalog_model.gd) | 132 |
| [training_partner_model.gd](../../client/godot/scripts/progression/training_partner_model.gd) | 94 |
| [tutorial_feature_model.gd](../../client/godot/scripts/progression/tutorial_feature_model.gd) | 53 |

</details>

## client/godot/scripts/qa

<details><summary>91 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [audio_ambience_owner_review.gd](../../client/godot/scripts/qa/audio_ambience_owner_review.gd) | 462 |
| [audio_impact_review_preview.gd](../../client/godot/scripts/qa/audio_impact_review_preview.gd) | 521 |
| [audio_main_runtime_check.gd](../../client/godot/scripts/qa/audio_main_runtime_check.gd) | 198 |
| [audio_music_review_preview.gd](../../client/godot/scripts/qa/audio_music_review_preview.gd) | 747 |
| [audio_runtime_check.gd](../../client/godot/scripts/qa/audio_runtime_check.gd) | 301 |
| [audio_settings_panel_check.gd](../../client/godot/scripts/qa/audio_settings_panel_check.gd) | 102 |
| [audio_world_context_check.gd](../../client/godot/scripts/qa/audio_world_context_check.gd) | 44 |
| [auto_check_coordinator.gd](../../client/godot/scripts/qa/auto_check_coordinator.gd) | 33024 |
| [backpack_awakened_owner_review_capture.gd](../../client/godot/scripts/qa/backpack_awakened_owner_review_capture.gd) | 916 |
| [backpack_awakened_owner_review_capture_check.gd](../../client/godot/scripts/qa/backpack_awakened_owner_review_capture_check.gd) | 218 |
| [battle_command_awakened_owner_review_capture.gd](../../client/godot/scripts/qa/battle_command_awakened_owner_review_capture.gd) | 435 |
| [battle_command_awakened_view_check.gd](../../client/godot/scripts/qa/battle_command_awakened_view_check.gd) | 739 |
| [battle_counter_action_state_check.gd](../../client/godot/scripts/qa/battle_counter_action_state_check.gd) | 50 |
| [battle_layout_owner_review_capture.gd](../../client/godot/scripts/qa/battle_layout_owner_review_capture.gd) | 3314 |
| [battle_outcome_owner_review_capture.gd](../../client/godot/scripts/qa/battle_outcome_owner_review_capture.gd) | 494 |
| [battle_result_input_check.gd](../../client/godot/scripts/qa/battle_result_input_check.gd) | 90 |
| [battle_visual_review_preview.gd](../../client/godot/scripts/qa/battle_visual_review_preview.gd) | 546 |
| [character_creation_owner_review_capture.gd](../../client/godot/scripts/qa/character_creation_owner_review_capture.gd) | 187 |
| [character_entry_flow_check.gd](../../client/godot/scripts/qa/character_entry_flow_check.gd) | 736 |
| [character_entry_owner_review_capture.gd](../../client/godot/scripts/qa/character_entry_owner_review_capture.gd) | 779 |
| [character_entry_review_preview.gd](../../client/godot/scripts/qa/character_entry_review_preview.gd) | 86 |
| [character_mount_art_check.gd](../../client/godot/scripts/qa/character_mount_art_check.gd) | 419 |
| [character_mount_art_preview.gd](../../client/godot/scripts/qa/character_mount_art_preview.gd) | 134 |
| [character_mount_direction_review.gd](../../client/godot/scripts/qa/character_mount_direction_review.gd) | 928 |
| [character_runtime_appearance_check.gd](../../client/godot/scripts/qa/character_runtime_appearance_check.gd) | 421 |
| [commerce_awakened_owner_review_capture.gd](../../client/godot/scripts/qa/commerce_awakened_owner_review_capture.gd) | 492 |
| [earth_vein_camera_composition_check.gd](../../client/godot/scripts/qa/earth_vein_camera_composition_check.gd) | 364 |
| [earth_vein_floor_hierarchy_check.gd](../../client/godot/scripts/qa/earth_vein_floor_hierarchy_check.gd) | 481 |
| [earth_vein_landmark_review_capture.gd](../../client/godot/scripts/qa/earth_vein_landmark_review_capture.gd) | 398 |
| [earth_vein_review_batch_capture.gd](../../client/godot/scripts/qa/earth_vein_review_batch_capture.gd) | 1462 |
| [earth_vein_review_contract_check.gd](../../client/godot/scripts/qa/earth_vein_review_contract_check.gd) | 113 |
| [evolution_trial_dialog_check.gd](../../client/godot/scripts/qa/evolution_trial_dialog_check.gd) | 47 |
| [firebud_village_service_layout_check.gd](../../client/godot/scripts/qa/firebud_village_service_layout_check.gd) | 544 |
| [guardian_battle_playthrough.gd](../../client/godot/scripts/qa/guardian_battle_playthrough.gd) | 254 |
| [guardian_battle_presentation_check.gd](../../client/godot/scripts/qa/guardian_battle_presentation_check.gd) | 106 |
| [guardian_battle_review.gd](../../client/godot/scripts/qa/guardian_battle_review.gd) | 174 |
| [hang_matchmaking_owner_review_capture.gd](../../client/godot/scripts/qa/hang_matchmaking_owner_review_capture.gd) | 716 |
| [hang_matchmaking_world_hud_owner_review_capture.gd](../../client/godot/scripts/qa/hang_matchmaking_world_hud_owner_review_capture.gd) | 1622 |
| [map_awakened_owner_review_capture.gd](../../client/godot/scripts/qa/map_awakened_owner_review_capture.gd) | 2654 |
| [map_performance_batch.gd](../../client/godot/scripts/qa/map_performance_batch.gd) | 294 |
| [map_visual_action_capture_batch.gd](../../client/godot/scripts/qa/map_visual_action_capture_batch.gd) | 1079 |
| [map_visual_release_contract_check.gd](../../client/godot/scripts/qa/map_visual_release_contract_check.gd) | 475 |
| [map_visual_review_capture.gd](../../client/godot/scripts/qa/map_visual_review_capture.gd) | 1824 |
| [map_visual_review_catalog_check.gd](../../client/godot/scripts/qa/map_visual_review_catalog_check.gd) | 1039 |
| [map_visual_review_showcase_profile.gd](../../client/godot/scripts/qa/map_visual_review_showcase_profile.gd) | 78 |
| [map_visual_review_showcase_profile_check.gd](../../client/godot/scripts/qa/map_visual_review_showcase_profile_check.gd) | 80 |
| [map_visual_runtime_check.gd](../../client/godot/scripts/qa/map_visual_runtime_check.gd) | 2281 |
| [market_awakened_owner_review_capture.gd](../../client/godot/scripts/qa/market_awakened_owner_review_capture.gd) | 595 |
| [mounted_action_asset_check.gd](../../client/godot/scripts/qa/mounted_action_asset_check.gd) | 187 |
| [movement_spam_probe_plan.gd](../../client/godot/scripts/qa/movement_spam_probe_plan.gd) | 70 |
| [npc_art_catalog_check.gd](../../client/godot/scripts/qa/npc_art_catalog_check.gd) | 568 |
| [npc_art_release_evidence_check.gd](../../client/godot/scripts/qa/npc_art_release_evidence_check.gd) | 1022 |
| [npc_direction_review.gd](../../client/godot/scripts/qa/npc_direction_review.gd) | 554 |
| [npc_hover_identity_check.gd](../../client/godot/scripts/qa/npc_hover_identity_check.gd) | 117 |
| [npc_main_review_capture.gd](../../client/godot/scripts/qa/npc_main_review_capture.gd) | 719 |
| [online_presence_refresh_check.gd](../../client/godot/scripts/qa/online_presence_refresh_check.gd) | 94 |
| [panel_registry_visibility_check.gd](../../client/godot/scripts/qa/panel_registry_visibility_check.gd) | 97 |
| [perf_probe_exit_controller.gd](../../client/godot/scripts/qa/perf_probe_exit_controller.gd) | 51 |
| [perf_probe_process_scope_boundary.gd](../../client/godot/scripts/qa/perf_probe_process_scope_boundary.gd) | 29 |
| [perf_probe_runtime_timing.gd](../../client/godot/scripts/qa/perf_probe_runtime_timing.gd) | 46 |
| [perf_probe_runtime_timing_check.gd](../../client/godot/scripts/qa/perf_probe_runtime_timing_check.gd) | 44 |
| [pet_action_art_preview.gd](../../client/godot/scripts/qa/pet_action_art_preview.gd) | 126 |
| [pet_action_asset_check.gd](../../client/godot/scripts/qa/pet_action_asset_check.gd) | 1353 |
| [pet_battle_review_lab.gd](../../client/godot/scripts/qa/pet_battle_review_lab.gd) | 1176 |
| [pet_battle_review_lab_check.gd](../../client/godot/scripts/qa/pet_battle_review_lab_check.gd) | 397 |
| [pet_codex_awakened_owner_review_capture.gd](../../client/godot/scripts/qa/pet_codex_awakened_owner_review_capture.gd) | 1115 |
| [pet_evolution_release_review.gd](../../client/godot/scripts/qa/pet_evolution_release_review.gd) | 389 |
| [pet_evolution_ui_check.gd](../../client/godot/scripts/qa/pet_evolution_ui_check.gd) | 344 |
| [pet_fusion_closed_review_capture.gd](../../client/godot/scripts/qa/pet_fusion_closed_review_capture.gd) | 278 |
| [pet_fusion_closed_review_sequence.gd](../../client/godot/scripts/qa/pet_fusion_closed_review_sequence.gd) | 617 |
| [pet_fusion_main_owner_review_capture.gd](../../client/godot/scripts/qa/pet_fusion_main_owner_review_capture.gd) | 1262 |
| [pet_fusion_panel_check.gd](../../client/godot/scripts/qa/pet_fusion_panel_check.gd) | 1077 |
| [pet_management_review_capture.gd](../../client/godot/scripts/qa/pet_management_review_capture.gd) | 453 |
| [pet_paid_reset_ui_check.gd](../../client/godot/scripts/qa/pet_paid_reset_ui_check.gd) | 395 |
| [pet_portrait_art_catalog_check.gd](../../client/godot/scripts/qa/pet_portrait_art_catalog_check.gd) | 325 |
| [pet_shared_portrait_consumer_check.gd](../../client/godot/scripts/qa/pet_shared_portrait_consumer_check.gd) | 162 |
| [pet_skill_page_model_check.gd](../../client/godot/scripts/qa/pet_skill_page_model_check.gd) | 509 |
| [pet_skill_page_review_capture.gd](../../client/godot/scripts/qa/pet_skill_page_review_capture.gd) | 266 |
| [player_character_main_flow_check.gd](../../client/godot/scripts/qa/player_character_main_flow_check.gd) | 509 |
| [player_character_owner_review_capture.gd](../../client/godot/scripts/qa/player_character_owner_review_capture.gd) | 498 |
| [player_visual_bounds_check.gd](../../client/godot/scripts/qa/player_visual_bounds_check.gd) | 123 |
| [remote_player_visual_check.gd](../../client/godot/scripts/qa/remote_player_visual_check.gd) | 96 |
| [review_capture_render_pump.gd](../../client/godot/scripts/qa/review_capture_render_pump.gd) | 76 |
| [runtime_exit_cleanup.gd](../../client/godot/scripts/qa/runtime_exit_cleanup.gd) | 90 |
| [standalone_pet_art_overlay_check.gd](../../client/godot/scripts/qa/standalone_pet_art_overlay_check.gd) | 520 |
| [standalone_pet_art_review_gate.gd](../../client/godot/scripts/qa/standalone_pet_art_review_gate.gd) | 139 |
| [world_depth_layer_check.gd](../../client/godot/scripts/qa/world_depth_layer_check.gd) | 553 |
| [world_ground_layer_check.gd](../../client/godot/scripts/qa/world_ground_layer_check.gd) | 157 |
| [world_hud_owner_review_capture.gd](../../client/godot/scripts/qa/world_hud_owner_review_capture.gd) | 908 |
| [world_presentation_profile_check.gd](../../client/godot/scripts/qa/world_presentation_profile_check.gd) | 341 |
| [world_review_frame_parity.gd](../../client/godot/scripts/qa/world_review_frame_parity.gd) | 205 |

</details>

## client/godot/scripts/ui

<details><summary>107 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [adventure_goal_presenter.gd](../../client/godot/scripts/ui/adventure_goal_presenter.gd) | 31 |
| [audio_settings_panel.gd](../../client/godot/scripts/ui/audio_settings_panel.gd) | 274 |
| [auto_capture_settings_presenter.gd](../../client/godot/scripts/ui/auto_capture_settings_presenter.gd) | 69 |
| [auto_settings_awakened_panel.gd](../../client/godot/scripts/ui/auto_settings_awakened_panel.gd) | 1045 |
| [auto_settings_awakened_panel_check.gd](../../client/godot/scripts/ui/auto_settings_awakened_panel_check.gd) | 255 |
| [auto_settings_awakened_presenter.gd](../../client/godot/scripts/ui/auto_settings_awakened_presenter.gd) | 89 |
| [backpack_awakened_item_card.gd](../../client/godot/scripts/ui/backpack_awakened_item_card.gd) | 340 |
| [backpack_awakened_panel.gd](../../client/godot/scripts/ui/backpack_awakened_panel.gd) | 1285 |
| [backpack_awakened_panel_check.gd](../../client/godot/scripts/ui/backpack_awakened_panel_check.gd) | 1336 |
| [backpack_awakened_presenter.gd](../../client/godot/scripts/ui/backpack_awakened_presenter.gd) | 708 |
| [backpack_awakened_presenter_check.gd](../../client/godot/scripts/ui/backpack_awakened_presenter_check.gd) | 9 |
| [backpack_awakened_visual_skin.gd](../../client/godot/scripts/ui/backpack_awakened_visual_skin.gd) | 292 |
| [backpack_item_icon_catalog.gd](../../client/godot/scripts/ui/backpack_item_icon_catalog.gd) | 481 |
| [backpack_item_icon_catalog_check.gd](../../client/godot/scripts/ui/backpack_item_icon_catalog_check.gd) | 55 |
| [backpack_panel_presenter.gd](../../client/godot/scripts/ui/backpack_panel_presenter.gd) | 139 |
| [bank_awakened_panel.gd](../../client/godot/scripts/ui/bank_awakened_panel.gd) | 386 |
| [battle_command_awakened_host.gd](../../client/godot/scripts/ui/battle_command_awakened_host.gd) | 296 |
| [battle_command_awakened_presenter.gd](../../client/godot/scripts/ui/battle_command_awakened_presenter.gd) | 98 |
| [battle_command_awakened_view.gd](../../client/godot/scripts/ui/battle_command_awakened_view.gd) | 881 |
| [battle_command_awakened_visual_skin.gd](../../client/godot/scripts/ui/battle_command_awakened_visual_skin.gd) | 125 |
| [battle_function_drawer.gd](../../client/godot/scripts/ui/battle_function_drawer.gd) | 339 |
| [battle_outcome_float_overlay.gd](../../client/godot/scripts/ui/battle_outcome_float_overlay.gd) | 331 |
| [battle_outcome_float_overlay_check.gd](../../client/godot/scripts/ui/battle_outcome_float_overlay_check.gd) | 74 |
| [battle_outcome_presentation_model.gd](../../client/godot/scripts/ui/battle_outcome_presentation_model.gd) | 457 |
| [character_creation_panel.gd](../../client/godot/scripts/ui/character_creation_panel.gd) | 794 |
| [character_entry_flow_controller.gd](../../client/godot/scripts/ui/character_entry_flow_controller.gd) | 888 |
| [character_entry_visual_skin.gd](../../client/godot/scripts/ui/character_entry_visual_skin.gd) | 477 |
| [character_management_panel.gd](../../client/godot/scripts/ui/character_management_panel.gd) | 1435 |
| [character_management_panel_check.gd](../../client/godot/scripts/ui/character_management_panel_check.gd) | 833 |
| [character_management_presenter.gd](../../client/godot/scripts/ui/character_management_presenter.gd) | 656 |
| [character_management_presenter_check.gd](../../client/godot/scripts/ui/character_management_presenter_check.gd) | 15 |
| [character_management_visual_skin.gd](../../client/godot/scripts/ui/character_management_visual_skin.gd) | 341 |
| [character_slot_card.gd](../../client/godot/scripts/ui/character_slot_card.gd) | 229 |
| [commerce_awakened_panel_check.gd](../../client/godot/scripts/ui/commerce_awakened_panel_check.gd) | 344 |
| [commerce_awakened_visual_skin.gd](../../client/godot/scripts/ui/commerce_awakened_visual_skin.gd) | 152 |
| [commerce_service_identity_presenter.gd](../../client/godot/scripts/ui/commerce_service_identity_presenter.gd) | 141 |
| [dialog_quest_coordinator.gd](../../client/godot/scripts/ui/dialog_quest_coordinator.gd) | 1252 |
| [equipment_instance_presenter.gd](../../client/godot/scripts/ui/equipment_instance_presenter.gd) | 857 |
| [equipment_synthesis_awakened_panel.gd](../../client/godot/scripts/ui/equipment_synthesis_awakened_panel.gd) | 449 |
| [equipment_synthesis_awakened_presenter.gd](../../client/godot/scripts/ui/equipment_synthesis_awakened_presenter.gd) | 61 |
| [evolution_trial_dialog_presenter.gd](../../client/godot/scripts/ui/evolution_trial_dialog_presenter.gd) | 51 |
| [family_awakened_panel.gd](../../client/godot/scripts/ui/family_awakened_panel.gd) | 1162 |
| [family_awakened_panel_check.gd](../../client/godot/scripts/ui/family_awakened_panel_check.gd) | 361 |
| [family_awakened_presenter.gd](../../client/godot/scripts/ui/family_awakened_presenter.gd) | 350 |
| [hang_matchmaking_awakened_panel.gd](../../client/godot/scripts/ui/hang_matchmaking_awakened_panel.gd) | 1195 |
| [hang_matchmaking_awakened_panel_check.gd](../../client/godot/scripts/ui/hang_matchmaking_awakened_panel_check.gd) | 611 |
| [hang_matchmaking_awakened_visual_skin.gd](../../client/godot/scripts/ui/hang_matchmaking_awakened_visual_skin.gd) | 255 |
| [hang_matchmaking_presenter.gd](../../client/godot/scripts/ui/hang_matchmaking_presenter.gd) | 250 |
| [hang_matchmaking_route_catalog.gd](../../client/godot/scripts/ui/hang_matchmaking_route_catalog.gd) | 188 |
| [hang_matchmaking_world_status.gd](../../client/godot/scripts/ui/hang_matchmaking_world_status.gd) | 100 |
| [item_drop_zone.gd](../../client/godot/scripts/ui/item_drop_zone.gd) | 33 |
| [item_slot_button.gd](../../client/godot/scripts/ui/item_slot_button.gd) | 178 |
| [map_awakened_panel.gd](../../client/godot/scripts/ui/map_awakened_panel.gd) | 1452 |
| [map_awakened_panel_check.gd](../../client/godot/scripts/ui/map_awakened_panel_check.gd) | 1657 |
| [map_awakened_presenter.gd](../../client/godot/scripts/ui/map_awakened_presenter.gd) | 192 |
| [map_awakened_visual_skin.gd](../../client/godot/scripts/ui/map_awakened_visual_skin.gd) | 309 |
| [market_awakened_panel.gd](../../client/godot/scripts/ui/market_awakened_panel.gd) | 1660 |
| [market_awakened_panel_check.gd](../../client/godot/scripts/ui/market_awakened_panel_check.gd) | 786 |
| [market_awakened_visual_skin.gd](../../client/godot/scripts/ui/market_awakened_visual_skin.gd) | 130 |
| [npc_dialog_presenter.gd](../../client/godot/scripts/ui/npc_dialog_presenter.gd) | 57 |
| [npc_hover_identity_presenter.gd](../../client/godot/scripts/ui/npc_hover_identity_presenter.gd) | 189 |
| [panel_flow_coordinator.gd](../../client/godot/scripts/ui/panel_flow_coordinator.gd) | 28889 |
| [panel_registry.gd](../../client/godot/scripts/ui/panel_registry.gd) | 91 |
| [password_visibility_button.gd](../../client/godot/scripts/ui/password_visibility_button.gd) | 53 |
| [pet_codex_acquisition_route_catalog.gd](../../client/godot/scripts/ui/pet_codex_acquisition_route_catalog.gd) | 213 |
| [pet_codex_awakened_panel.gd](../../client/godot/scripts/ui/pet_codex_awakened_panel.gd) | 1467 |
| [pet_codex_awakened_panel_check.gd](../../client/godot/scripts/ui/pet_codex_awakened_panel_check.gd) | 544 |
| [pet_codex_entry_button.gd](../../client/godot/scripts/ui/pet_codex_entry_button.gd) | 61 |
| [pet_codex_presenter.gd](../../client/godot/scripts/ui/pet_codex_presenter.gd) | 585 |
| [pet_codex_visual_skin.gd](../../client/godot/scripts/ui/pet_codex_visual_skin.gd) | 107 |
| [pet_evolution_panel.gd](../../client/godot/scripts/ui/pet_evolution_panel.gd) | 206 |
| [pet_evolution_sequence_player.gd](../../client/godot/scripts/ui/pet_evolution_sequence_player.gd) | 307 |
| [pet_fusion_panel.gd](../../client/godot/scripts/ui/pet_fusion_panel.gd) | 1801 |
| [pet_growth_bar_control.gd](../../client/godot/scripts/ui/pet_growth_bar_control.gd) | 155 |
| [pet_growth_manual_evaluation_panel.gd](../../client/godot/scripts/ui/pet_growth_manual_evaluation_panel.gd) | 192 |
| [pet_growth_manual_evaluation_presenter.gd](../../client/godot/scripts/ui/pet_growth_manual_evaluation_presenter.gd) | 114 |
| [pet_growth_overview_panel.gd](../../client/godot/scripts/ui/pet_growth_overview_panel.gd) | 111 |
| [pet_growth_quality_badge.gd](../../client/godot/scripts/ui/pet_growth_quality_badge.gd) | 110 |
| [pet_growth_radar_control.gd](../../client/godot/scripts/ui/pet_growth_radar_control.gd) | 70 |
| [pet_growth_rule_preview_presenter.gd](../../client/godot/scripts/ui/pet_growth_rule_preview_presenter.gd) | 121 |
| [pet_growth_stage_button.gd](../../client/godot/scripts/ui/pet_growth_stage_button.gd) | 133 |
| [pet_list_entry_button.gd](../../client/godot/scripts/ui/pet_list_entry_button.gd) | 264 |
| [pet_management_visual_skin.gd](../../client/godot/scripts/ui/pet_management_visual_skin.gd) | 296 |
| [pet_paid_reset_panel.gd](../../client/godot/scripts/ui/pet_paid_reset_panel.gd) | 211 |
| [pet_portrait_art_catalog.gd](../../client/godot/scripts/ui/pet_portrait_art_catalog.gd) | 263 |
| [pet_showcase_art_catalog.gd](../../client/godot/scripts/ui/pet_showcase_art_catalog.gd) | 32 |
| [pet_showcase_panel.gd](../../client/godot/scripts/ui/pet_showcase_panel.gd) | 360 |
| [pet_skill_card.gd](../../client/godot/scripts/ui/pet_skill_card.gd) | 361 |
| [pet_skill_icon_catalog.gd](../../client/godot/scripts/ui/pet_skill_icon_catalog.gd) | 112 |
| [pet_skill_overview_panel.gd](../../client/godot/scripts/ui/pet_skill_overview_panel.gd) | 287 |
| [pet_skill_visual_skin.gd](../../client/godot/scripts/ui/pet_skill_visual_skin.gd) | 201 |
| [pet_state_badge_control.gd](../../client/godot/scripts/ui/pet_state_badge_control.gd) | 170 |
| [qa_panel_catalog.gd](../../client/godot/scripts/ui/qa_panel_catalog.gd) | 91 |
| [qa_panel_presenter.gd](../../client/godot/scripts/ui/qa_panel_presenter.gd) | 129 |
| [quest_awakened_panel.gd](../../client/godot/scripts/ui/quest_awakened_panel.gd) | 719 |
| [quest_awakened_presenter.gd](../../client/godot/scripts/ui/quest_awakened_presenter.gd) | 414 |
| [shop_awakened_panel.gd](../../client/godot/scripts/ui/shop_awakened_panel.gd) | 400 |
| [world_hud_awakened_presenter.gd](../../client/godot/scripts/ui/world_hud_awakened_presenter.gd) | 357 |
| [world_hud_awakened_presenter_check.gd](../../client/godot/scripts/ui/world_hud_awakened_presenter_check.gd) | 263 |
| [world_hud_awakened_view.gd](../../client/godot/scripts/ui/world_hud_awakened_view.gd) | 2469 |
| [world_hud_awakened_view_check.gd](../../client/godot/scripts/ui/world_hud_awakened_view_check.gd) | 1752 |
| [world_hud_awakened_visual_skin.gd](../../client/godot/scripts/ui/world_hud_awakened_visual_skin.gd) | 408 |
| [world_hud_minimap_render_canvas.gd](../../client/godot/scripts/ui/world_hud_minimap_render_canvas.gd) | 62 |
| [world_hud_party_roster_check.gd](../../client/godot/scripts/ui/world_hud_party_roster_check.gd) | 642 |
| [world_hud_party_roster_presenter.gd](../../client/godot/scripts/ui/world_hud_party_roster_presenter.gd) | 458 |
| [world_hud_party_roster_view.gd](../../client/godot/scripts/ui/world_hud_party_roster_view.gd) | 372 |
| [world_hud_party_roster_visual_skin.gd](../../client/godot/scripts/ui/world_hud_party_roster_visual_skin.gd) | 250 |

</details>

## client/godot/scripts/world

<details><summary>24 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [encounter_model.gd](../../client/godot/scripts/world/encounter_model.gd) | 221 |
| [interaction_model.gd](../../client/godot/scripts/world/interaction_model.gd) | 194 |
| [interaction_occlusion_model.gd](../../client/godot/scripts/world/interaction_occlusion_model.gd) | 13 |
| [isometric_map_model.gd](../../client/godot/scripts/world/isometric_map_model.gd) | 521 |
| [map_data_catalog.gd](../../client/godot/scripts/world/map_data_catalog.gd) | 49 |
| [map_ground_mesh.gd](../../client/godot/scripts/world/map_ground_mesh.gd) | 61 |
| [map_region_catalog.gd](../../client/godot/scripts/world/map_region_catalog.gd) | 235 |
| [map_route_planner.gd](../../client/godot/scripts/world/map_route_planner.gd) | 234 |
| [map_route_planner_check.gd](../../client/godot/scripts/world/map_route_planner_check.gd) | 234 |
| [map_visual_catalog.gd](../../client/godot/scripts/world/map_visual_catalog.gd) | 2358 |
| [map_visual_renderer.gd](../../client/godot/scripts/world/map_visual_renderer.gd) | 231 |
| [npc_art_catalog.gd](../../client/godot/scripts/world/npc_art_catalog.gd) | 2267 |
| [npc_art_release_evidence.gd](../../client/godot/scripts/world/npc_art_release_evidence.gd) | 1658 |
| [quest_marker_visibility_model.gd](../../client/godot/scripts/world/quest_marker_visibility_model.gd) | 70 |
| [remote_player_visual.gd](../../client/godot/scripts/world/remote_player_visual.gd) | 97 |
| [server_encounter_permit_model.gd](../../client/godot/scripts/world/server_encounter_permit_model.gd) | 65 |
| [world_camera_safe_area_model.gd](../../client/godot/scripts/world/world_camera_safe_area_model.gd) | 676 |
| [world_camera_safe_area_model_check.gd](../../client/godot/scripts/world/world_camera_safe_area_model_check.gd) | 543 |
| [world_depth_layer.gd](../../client/godot/scripts/world/world_depth_layer.gd) | 722 |
| [world_ground_layer.gd](../../client/godot/scripts/world/world_ground_layer.gd) | 51 |
| [world_overlay_layer.gd](../../client/godot/scripts/world/world_overlay_layer.gd) | 302 |
| [world_presentation_profile.gd](../../client/godot/scripts/world/world_presentation_profile.gd) | 121 |
| [world_visual_direction_contract.gd](../../client/godot/scripts/world/world_visual_direction_contract.gd) | 52 |
| [world_visual_grade.gd](../../client/godot/scripts/world/world_visual_grade.gd) | 153 |

</details>

## server/node/scripts

<details><summary>13 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [bootstrap-mail-storage.js](../../server/node/scripts/bootstrap-mail-storage.js) | 286 |
| [enable-mail-active-limit.js](../../server/node/scripts/enable-mail-active-limit.js) | 146 |
| [enable-mail-archive.js](../../server/node/scripts/enable-mail-archive.js) | 145 |
| [enable-reward-vault.js](../../server/node/scripts/enable-reward-vault.js) | 145 |
| [local-qa-gm-account.js](../../server/node/scripts/local-qa-gm-account.js) | 438 |
| [migrate-local-userdata-to-mysql.js](../../server/node/scripts/migrate-local-userdata-to-mysql.js) | 865 |
| [migrate-mysql-profiles.js](../../server/node/scripts/migrate-mysql-profiles.js) | 387 |
| [mysql-live-smoke.js](../../server/node/scripts/mysql-live-smoke.js) | 87 |
| [offline-hang-live-server.js](../../server/node/scripts/offline-hang-live-server.js) | 37 |
| [pet-fusion-runtime-transaction-audit.js](../../server/node/scripts/pet-fusion-runtime-transaction-audit.js) | 689 |
| [seed-demo-data.js](../../server/node/scripts/seed-demo-data.js) | 838 |
| [server-ops.js](../../server/node/scripts/server-ops.js) | 653 |
| [setup-local-mysql.js](../../server/node/scripts/setup-local-mysql.js) | 131 |

</details>

## server/node/src

<details><summary>45 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [auth-service.js](../../server/node/src/auth-service.js) | 27376 |
| [cluster-battle-router.js](../../server/node/src/cluster-battle-router.js) | 895 |
| [cluster-event-runtime-config.js](../../server/node/src/cluster-event-runtime-config.js) | 333 |
| [event-cluster-relay.js](../../server/node/src/event-cluster-relay.js) | 581 |
| [event-hub-subscriptions.js](../../server/node/src/event-hub-subscriptions.js) | 271 |
| [event-hub-writer.js](../../server/node/src/event-hub-writer.js) | 515 |
| [event-hub.js](../../server/node/src/event-hub.js) | 2937 |
| [event-projection-cache.js](../../server/node/src/event-projection-cache.js) | 42 |
| [event-stream-cursor.js](../../server/node/src/event-stream-cursor.js) | 121 |
| [health-monitor.js](../../server/node/src/health-monitor.js) | 157 |
| [http-auth-boundary.js](../../server/node/src/http-auth-boundary.js) | 159 |
| [http-list-options.js](../../server/node/src/http-list-options.js) | 116 |
| [http-security-boundary.js](../../server/node/src/http-security-boundary.js) | 252 |
| [http-server.js](../../server/node/src/http-server.js) | 1954 |
| [mail-archive-maintenance.js](../../server/node/src/mail-archive-maintenance.js) | 242 |
| [mysql-backup-artifact.js](../../server/node/src/mysql-backup-artifact.js) | 290 |
| [mysql-backup-health.js](../../server/node/src/mysql-backup-health.js) | 582 |
| [mysql-mail-active-limit-feature-enable.js](../../server/node/src/mysql-mail-active-limit-feature-enable.js) | 426 |
| [mysql-mail-archive-feature-enable.js](../../server/node/src/mysql-mail-archive-feature-enable.js) | 548 |
| [mysql-mail-archive.js](../../server/node/src/mysql-mail-archive.js) | 1223 |
| [mysql-mail-storage-bootstrap-apply.js](../../server/node/src/mysql-mail-storage-bootstrap-apply.js) | 615 |
| [mysql-mail-storage-bootstrap-catalog.js](../../server/node/src/mysql-mail-storage-bootstrap-catalog.js) | 107 |
| [mysql-mail-storage-bootstrap-dry-run.js](../../server/node/src/mysql-mail-storage-bootstrap-dry-run.js) | 280 |
| [mysql-mail-storage-bootstrap-plan.js](../../server/node/src/mysql-mail-storage-bootstrap-plan.js) | 819 |
| [mysql-mail-storage-bootstrap-public-report.js](../../server/node/src/mysql-mail-storage-bootstrap-public-report.js) | 129 |
| [mysql-mail-storage-bootstrap-read.js](../../server/node/src/mysql-mail-storage-bootstrap-read.js) | 433 |
| [mysql-mail-storage-forward-maintenance.js](../../server/node/src/mysql-mail-storage-forward-maintenance.js) | 535 |
| [mysql-mail-storage-forward-writes.js](../../server/node/src/mysql-mail-storage-forward-writes.js) | 772 |
| [mysql-mail-storage-schema.js](../../server/node/src/mysql-mail-storage-schema.js) | 863 |
| [mysql-resource-acquisition-order.js](../../server/node/src/mysql-resource-acquisition-order.js) | 1412 |
| [mysql-reward-vault-claim.js](../../server/node/src/mysql-reward-vault-claim.js) | 195 |
| [mysql-reward-vault-delivery.js](../../server/node/src/mysql-reward-vault-delivery.js) | 653 |
| [mysql-reward-vault-feature-enable.js](../../server/node/src/mysql-reward-vault-feature-enable.js) | 349 |
| [mysql-reward-vault-writes.js](../../server/node/src/mysql-reward-vault-writes.js) | 174 |
| [mysql-reward-vault.js](../../server/node/src/mysql-reward-vault.js) | 339 |
| [mysql-store.js](../../server/node/src/mysql-store.js) | 9250 |
| [mysql-transaction-guard.js](../../server/node/src/mysql-transaction-guard.js) | 447 |
| [network-admission.js](../../server/node/src/network-admission.js) | 503 |
| [protocol.js](../../server/node/src/protocol.js) | 111 |
| [public-edge-runtime-config.js](../../server/node/src/public-edge-runtime-config.js) | 155 |
| [reward-vault-delivery-maintenance.js](../../server/node/src/reward-vault-delivery-maintenance.js) | 175 |
| [valkey-account-owner.js](../../server/node/src/valkey-account-owner.js) | 800 |
| [valkey-battle-runtime-store.js](../../server/node/src/valkey-battle-runtime-store.js) | 680 |
| [valkey-stream-event-bridge.js](../../server/node/src/valkey-stream-event-bridge.js) | 958 |
| [websocket-frame-parser.js](../../server/node/src/websocket-frame-parser.js) | 422 |

</details>

## server/node/src/auth

<details><summary>125 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [account-characters.js](../../server/node/src/auth/account-characters.js) | 987 |
| [authority-record-state.js](../../server/node/src/auth/authority-record-state.js) | 465 |
| [authority-root-clone.js](../../server/node/src/auth/authority-root-clone.js) | 990 |
| [authority-root-materialization.js](../../server/node/src/auth/authority-root-materialization.js) | 52 |
| [auto-capture-settings.js](../../server/node/src/auth/auto-capture-settings.js) | 453 |
| [bank-profile-state.js](../../server/node/src/auth/bank-profile-state.js) | 691 |
| [battle-actor-rules.js](../../server/node/src/auth/battle-actor-rules.js) | 132 |
| [battle-boss-rules.js](../../server/node/src/auth/battle-boss-rules.js) | 1243 |
| [battle-combat-formula.js](../../server/node/src/auth/battle-combat-formula.js) | 203 |
| [battle-control-rules.js](../../server/node/src/auth/battle-control-rules.js) | 104 |
| [battle-element-rules.js](../../server/node/src/auth/battle-element-rules.js) | 322 |
| [battle-equipment-rules.js](../../server/node/src/auth/battle-equipment-rules.js) | 506 |
| [battle-exp-catalog.js](../../server/node/src/auth/battle-exp-catalog.js) | 182 |
| [battle-failure-ticket.js](../../server/node/src/auth/battle-failure-ticket.js) | 448 |
| [battle-passive-catalog.js](../../server/node/src/auth/battle-passive-catalog.js) | 256 |
| [battle-random-authority.js](../../server/node/src/auth/battle-random-authority.js) | 141 |
| [battle-reaction-resolver.js](../../server/node/src/auth/battle-reaction-resolver.js) | 99 |
| [battle-reaction-rules.js](../../server/node/src/auth/battle-reaction-rules.js) | 168 |
| [battle-riding-rules.js](../../server/node/src/auth/battle-riding-rules.js) | 128 |
| [battle-room-cow.js](../../server/node/src/auth/battle-room-cow.js) | 33 |
| [battle-room.js](../../server/node/src/auth/battle-room.js) | 1037 |
| [battle-status-rules.js](../../server/node/src/auth/battle-status-rules.js) | 124 |
| [character-name-policy.js](../../server/node/src/auth/character-name-policy.js) | 204 |
| [cluster-account-authority.js](../../server/node/src/auth/cluster-account-authority.js) | 230 |
| [cluster-battle-runtime.js](../../server/node/src/auth/cluster-battle-runtime.js) | 291 |
| [currency-wallet.js](../../server/node/src/auth/currency-wallet.js) | 132 |
| [durable-mutation-coordinator.js](../../server/node/src/auth/durable-mutation-coordinator.js) | 317 |
| [durable-mutation-state.js](../../server/node/src/auth/durable-mutation-state.js) | 1239 |
| [durable-receipt-read-model.js](../../server/node/src/auth/durable-receipt-read-model.js) | 69 |
| [economy.js](../../server/node/src/auth/economy.js) | 3282 |
| [equipment-envelope-consumed-ledger.js](../../server/node/src/auth/equipment-envelope-consumed-ledger.js) | 655 |
| [equipment-envelope-registry.js](../../server/node/src/auth/equipment-envelope-registry.js) | 1113 |
| [equipment-profile-migration.js](../../server/node/src/auth/equipment-profile-migration.js) | 1414 |
| [equipment-profile-state.js](../../server/node/src/auth/equipment-profile-state.js) | 767 |
| [equipment-trade-reservation.js](../../server/node/src/auth/equipment-trade-reservation.js) | 218 |
| [equipment-transfer-envelope.js](../../server/node/src/auth/equipment-transfer-envelope.js) | 909 |
| [family-manor.js](../../server/node/src/auth/family-manor.js) | 1527 |
| [gm-pet-capture-recovery.js](../../server/node/src/auth/gm-pet-capture-recovery.js) | 414 |
| [gm-pet-evolution-qa.js](../../server/node/src/auth/gm-pet-evolution-qa.js) | 654 |
| [gm-pet-paid-reset-config.js](../../server/node/src/auth/gm-pet-paid-reset-config.js) | 142 |
| [gm-pet-paid-reset-qa.js](../../server/node/src/auth/gm-pet-paid-reset-qa.js) | 630 |
| [gm-pets.js](../../server/node/src/auth/gm-pets.js) | 340 |
| [gm-qa-assets.js](../../server/node/src/auth/gm-qa-assets.js) | 1177 |
| [gm-qa-pets.js](../../server/node/src/auth/gm-qa-pets.js) | 939 |
| [gm-qa-profile.js](../../server/node/src/auth/gm-qa-profile.js) | 307 |
| [hang-matchmaking.js](../../server/node/src/auth/hang-matchmaking.js) | 1343 |
| [local-qa-gm-account-ops.js](../../server/node/src/auth/local-qa-gm-account-ops.js) | 712 |
| [local-qa-gm-policy.js](../../server/node/src/auth/local-qa-gm-policy.js) | 260 |
| [mail-archive-pagination.js](../../server/node/src/auth/mail-archive-pagination.js) | 295 |
| [mail-archive-service.js](../../server/node/src/auth/mail-archive-service.js) | 76 |
| [mail-attachment-state.js](../../server/node/src/auth/mail-attachment-state.js) | 569 |
| [mail-authority-state.js](../../server/node/src/auth/mail-authority-state.js) | 787 |
| [mail-center-summary.js](../../server/node/src/auth/mail-center-summary.js) | 86 |
| [mail-chat.js](../../server/node/src/auth/mail-chat.js) | 916 |
| [mail-claim-consistency.js](../../server/node/src/auth/mail-claim-consistency.js) | 310 |
| [mail-inbox-pagination.js](../../server/node/src/auth/mail-inbox-pagination.js) | 319 |
| [mail-lifecycle-state.js](../../server/node/src/auth/mail-lifecycle-state.js) | 188 |
| [mail-read-consistency.js](../../server/node/src/auth/mail-read-consistency.js) | 169 |
| [mail-send-consistency.js](../../server/node/src/auth/mail-send-consistency.js) | 579 |
| [manual-encounter-access.js](../../server/node/src/auth/manual-encounter-access.js) | 663 |
| [market-listing-state.js](../../server/node/src/auth/market-listing-state.js) | 389 |
| [new-pet-factory.js](../../server/node/src/auth/new-pet-factory.js) | 335 |
| [offline-hang.js](../../server/node/src/auth/offline-hang.js) | 635 |
| [online-player-appearance.js](../../server/node/src/auth/online-player-appearance.js) | 46 |
| [online-presence.js](../../server/node/src/auth/online-presence.js) | 266 |
| [party.js](../../server/node/src/auth/party.js) | 390 |
| [pet-auto-capture-filter.js](../../server/node/src/auth/pet-auto-capture-filter.js) | 497 |
| [pet-capture-candidate-authority.js](../../server/node/src/auth/pet-capture-candidate-authority.js) | 1273 |
| [pet-capture-shelter.js](../../server/node/src/auth/pet-capture-shelter.js) | 552 |
| [pet-encounter-authority.js](../../server/node/src/auth/pet-encounter-authority.js) | 895 |
| [pet-encounter-permit-authority.js](../../server/node/src/auth/pet-encounter-permit-authority.js) | 588 |
| [pet-evolution-balance.js](../../server/node/src/auth/pet-evolution-balance.js) | 356 |
| [pet-evolution-domain.js](../../server/node/src/auth/pet-evolution-domain.js) | 467 |
| [pet-evolution-release-attestation.js](../../server/node/src/auth/pet-evolution-release-attestation.js) | 431 |
| [pet-evolution-route-catalog.js](../../server/node/src/auth/pet-evolution-route-catalog.js) | 675 |
| [pet-evolution.js](../../server/node/src/auth/pet-evolution.js) | 612 |
| [pet-exp-settlement.js](../../server/node/src/auth/pet-exp-settlement.js) | 392 |
| [pet-fusion-domain.js](../../server/node/src/auth/pet-fusion-domain.js) | 945 |
| [pet-fusion-random-authority.js](../../server/node/src/auth/pet-fusion-random-authority.js) | 172 |
| [pet-fusion-recipe-catalog.js](../../server/node/src/auth/pet-fusion-recipe-catalog.js) | 871 |
| [pet-fusion-release-attestation.js](../../server/node/src/auth/pet-fusion-release-attestation.js) | 916 |
| [pet-fusion-skill-policy.js](../../server/node/src/auth/pet-fusion-skill-policy.js) | 201 |
| [pet-fusion.js](../../server/node/src/auth/pet-fusion.js) | 455 |
| [pet-growth-authority.js](../../server/node/src/auth/pet-growth-authority.js) | 330 |
| [pet-growth-catalog.js](../../server/node/src/auth/pet-growth-catalog.js) | 637 |
| [pet-growth-evaluation-settings.js](../../server/node/src/auth/pet-growth-evaluation-settings.js) | 76 |
| [pet-growth-quality-presentation.js](../../server/node/src/auth/pet-growth-quality-presentation.js) | 350 |
| [pet-growth-runtime.js](../../server/node/src/auth/pet-growth-runtime.js) | 784 |
| [pet-level-one-percentile.js](../../server/node/src/auth/pet-level-one-percentile.js) | 198 |
| [pet-observed-growth-rule-preview.js](../../server/node/src/auth/pet-observed-growth-rule-preview.js) | 321 |
| [pet-observed-growth-screening.js](../../server/node/src/auth/pet-observed-growth-screening.js) | 530 |
| [pet-paid-reset-domain.js](../../server/node/src/auth/pet-paid-reset-domain.js) | 502 |
| [pet-paid-reset-payment.js](../../server/node/src/auth/pet-paid-reset-payment.js) | 110 |
| [pet-paid-reset-policy-catalog.js](../../server/node/src/auth/pet-paid-reset-policy-catalog.js) | 638 |
| [pet-paid-reset.js](../../server/node/src/auth/pet-paid-reset.js) | 640 |
| [pet-private-seed.js](../../server/node/src/auth/pet-private-seed.js) | 75 |
| [pet-private-state.js](../../server/node/src/auth/pet-private-state.js) | 70 |
| [pet-protection-policy.js](../../server/node/src/auth/pet-protection-policy.js) | 468 |
| [pet-rebirth-balance.js](../../server/node/src/auth/pet-rebirth-balance.js) | 463 |
| [pet-rebirth-growth-cycle.js](../../server/node/src/auth/pet-rebirth-growth-cycle.js) | 185 |
| [pet-ride-permit.js](../../server/node/src/auth/pet-ride-permit.js) | 108 |
| [pet-service-access.js](../../server/node/src/auth/pet-service-access.js) | 229 |
| [pet-skill-loadout.js](../../server/node/src/auth/pet-skill-loadout.js) | 88 |
| [pet-tame-permit.js](../../server/node/src/auth/pet-tame-permit.js) | 119 |
| [pet-terminal-path.js](../../server/node/src/auth/pet-terminal-path.js) | 90 |
| [player-appearance-catalog.js](../../server/node/src/auth/player-appearance-catalog.js) | 68 |
| [player-level-runtime.js](../../server/node/src/auth/player-level-runtime.js) | 140 |
| [player-stat-allocation.js](../../server/node/src/auth/player-stat-allocation.js) | 125 |
| [profile-actions.js](../../server/node/src/auth/profile-actions.js) | 485 |
| [profile-migration-backup.js](../../server/node/src/auth/profile-migration-backup.js) | 265 |
| [profile-migration-batch-ops.js](../../server/node/src/auth/profile-migration-batch-ops.js) | 1252 |
| [profile-migrations.js](../../server/node/src/auth/profile-migrations.js) | 902 |
| [profile-visibility.js](../../server/node/src/auth/profile-visibility.js) | 1156 |
| [progression-leveling-soak.js](../../server/node/src/auth/progression-leveling-soak.js) | 211 |
| [progression-route-catalog.js](../../server/node/src/auth/progression-route-catalog.js) | 296 |
| [quest.js](../../server/node/src/auth/quest.js) | 165 |
| [reward-vault-claim-consistency.js](../../server/node/src/auth/reward-vault-claim-consistency.js) | 94 |
| [reward-vault-pagination.js](../../server/node/src/auth/reward-vault-pagination.js) | 251 |
| [reward-vault-service.js](../../server/node/src/auth/reward-vault-service.js) | 241 |
| [reward-vault-state.js](../../server/node/src/auth/reward-vault-state.js) | 565 |
| [runtime-battle-recovery.js](../../server/node/src/auth/runtime-battle-recovery.js) | 237 |
| [runtime-invite-boundary.js](../../server/node/src/auth/runtime-invite-boundary.js) | 119 |
| [shared-asset-read-model.js](../../server/node/src/auth/shared-asset-read-model.js) | 636 |
| [tutorial-market.js](../../server/node/src/auth/tutorial-market.js) | 65 |
| [wild-capture-growth-selection.js](../../server/node/src/auth/wild-capture-growth-selection.js) | 330 |

</details>

## server/node/test

<details><summary>217 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [auth-account-characters.test.js](../../server/node/test/auth-account-characters.test.js) | 849 |
| [auth-auth-session.test.js](../../server/node/test/auth-auth-session.test.js) | 783 |
| [auth-auto-capture-filter-integration.test.js](../../server/node/test/auth-auto-capture-filter-integration.test.js) | 345 |
| [auth-auto-capture-settings.test.js](../../server/node/test/auth-auto-capture-settings.test.js) | 440 |
| [auth-battle-boss-mechanics.test.js](../../server/node/test/auth-battle-boss-mechanics.test.js) | 643 |
| [auth-battle-equipment-authority.test.js](../../server/node/test/auth-battle-equipment-authority.test.js) | 707 |
| [auth-battle-riding-authority.test.js](../../server/node/test/auth-battle-riding-authority.test.js) | 624 |
| [auth-battle-room.test.js](../../server/node/test/auth-battle-room.test.js) | 5937 |
| [auth-battle-status-lifecycle.test.js](../../server/node/test/auth-battle-status-lifecycle.test.js) | 550 |
| [auth-capacity-reconciliation.test.js](../../server/node/test/auth-capacity-reconciliation.test.js) | 294 |
| [auth-character-element-battle-integration.test.js](../../server/node/test/auth-character-element-battle-integration.test.js) | 182 |
| [auth-credential-security.test.js](../../server/node/test/auth-credential-security.test.js) | 89 |
| [auth-currency-wallet-boundary.test.js](../../server/node/test/auth-currency-wallet-boundary.test.js) | 177 |
| [auth-durable-commit.test.js](../../server/node/test/auth-durable-commit.test.js) | 3377 |
| [auth-economy.test.js](../../server/node/test/auth-economy.test.js) | 2436 |
| [auth-equipment-envelope-quarantine.test.js](../../server/node/test/auth-equipment-envelope-quarantine.test.js) | 217 |
| [auth-equipment-exact-instance.test.js](../../server/node/test/auth-equipment-exact-instance.test.js) | 209 |
| [auth-family-manor.test.js](../../server/node/test/auth-family-manor.test.js) | 405 |
| [auth-gm-pet-capture-recovery.test.js](../../server/node/test/auth-gm-pet-capture-recovery.test.js) | 319 |
| [auth-gm-pet-evolution-qa.test.js](../../server/node/test/auth-gm-pet-evolution-qa.test.js) | 381 |
| [auth-gm-pet-paid-reset-config.test.js](../../server/node/test/auth-gm-pet-paid-reset-config.test.js) | 213 |
| [auth-gm-pet-paid-reset-qa.test.js](../../server/node/test/auth-gm-pet-paid-reset-qa.test.js) | 296 |
| [auth-gm-pets.test.js](../../server/node/test/auth-gm-pets.test.js) | 389 |
| [auth-gm-qa-assets.test.js](../../server/node/test/auth-gm-qa-assets.test.js) | 896 |
| [auth-gm-qa-pets.test.js](../../server/node/test/auth-gm-qa-pets.test.js) | 668 |
| [auth-gm-qa-profile.test.js](../../server/node/test/auth-gm-qa-profile.test.js) | 467 |
| [auth-hang-matchmaking.test.js](../../server/node/test/auth-hang-matchmaking.test.js) | 832 |
| [auth-http-server.test.js](../../server/node/test/auth-http-server.test.js) | 2829 |
| [auth-offline-hang.test.js](../../server/node/test/auth-offline-hang.test.js) | 253 |
| [auth-pet-evolution-durable.test.js](../../server/node/test/auth-pet-evolution-durable.test.js) | 167 |
| [auth-pet-evolution-http.test.js](../../server/node/test/auth-pet-evolution-http.test.js) | 129 |
| [auth-pet-evolution.test.js](../../server/node/test/auth-pet-evolution.test.js) | 412 |
| [auth-pet-fusion-battle.test.js](../../server/node/test/auth-pet-fusion-battle.test.js) | 262 |
| [auth-pet-fusion-closed-http.test.js](../../server/node/test/auth-pet-fusion-closed-http.test.js) | 764 |
| [auth-pet-fusion-durable.test.js](../../server/node/test/auth-pet-fusion-durable.test.js) | 217 |
| [auth-pet-fusion-http.test.js](../../server/node/test/auth-pet-fusion-http.test.js) | 220 |
| [auth-pet-fusion.test.js](../../server/node/test/auth-pet-fusion.test.js) | 913 |
| [auth-pet-paid-reset-durable.test.js](../../server/node/test/auth-pet-paid-reset-durable.test.js) | 197 |
| [auth-pet-paid-reset-http.test.js](../../server/node/test/auth-pet-paid-reset-http.test.js) | 166 |
| [auth-pet-paid-reset.test.js](../../server/node/test/auth-pet-paid-reset.test.js) | 303 |
| [auth-pet-recovery-http.test.js](../../server/node/test/auth-pet-recovery-http.test.js) | 270 |
| [auth-pet-recovery-shelter.test.js](../../server/node/test/auth-pet-recovery-shelter.test.js) | 586 |
| [auth-profile-actions.test.js](../../server/node/test/auth-profile-actions.test.js) | 2603 |
| [auth-profile-visibility.test.js](../../server/node/test/auth-profile-visibility.test.js) | 1058 |
| [auth-quest-hang.test.js](../../server/node/test/auth-quest-hang.test.js) | 1129 |
| [auth-reward-vault.test.js](../../server/node/test/auth-reward-vault.test.js) | 509 |
| [auth-service-public-profile.test.js](../../server/node/test/auth-service-public-profile.test.js) | 103 |
| [auth-shared-asset-read-through.test.js](../../server/node/test/auth-shared-asset-read-through.test.js) | 2016 |
| [auth-social-world.test.js](../../server/node/test/auth-social-world.test.js) | 2514 |
| [auth-storage.test.js](../../server/node/test/auth-storage.test.js) | 3652 |
| [authority-record-state.test.js](../../server/node/test/authority-record-state.test.js) | 115 |
| [authority-root-clone.test.js](../../server/node/test/authority-root-clone.test.js) | 1356 |
| [bank-profile-state.test.js](../../server/node/test/bank-profile-state.test.js) | 230 |
| [battle-actor-rules.test.js](../../server/node/test/battle-actor-rules.test.js) | 203 |
| [battle-boss-rules.test.js](../../server/node/test/battle-boss-rules.test.js) | 555 |
| [battle-character-authority.test.js](../../server/node/test/battle-character-authority.test.js) | 129 |
| [battle-combat-formula.test.js](../../server/node/test/battle-combat-formula.test.js) | 62 |
| [battle-control-rules.test.js](../../server/node/test/battle-control-rules.test.js) | 115 |
| [battle-element-rules.test.js](../../server/node/test/battle-element-rules.test.js) | 168 |
| [battle-equipment-rules.test.js](../../server/node/test/battle-equipment-rules.test.js) | 289 |
| [battle-exp-catalog.test.js](../../server/node/test/battle-exp-catalog.test.js) | 81 |
| [battle-failure-ticket.test.js](../../server/node/test/battle-failure-ticket.test.js) | 184 |
| [battle-passive-catalog.test.js](../../server/node/test/battle-passive-catalog.test.js) | 140 |
| [battle-random-authority.test.js](../../server/node/test/battle-random-authority.test.js) | 98 |
| [battle-reaction-resolver.test.js](../../server/node/test/battle-reaction-resolver.test.js) | 103 |
| [battle-reaction-rules.test.js](../../server/node/test/battle-reaction-rules.test.js) | 88 |
| [battle-riding-rules.test.js](../../server/node/test/battle-riding-rules.test.js) | 99 |
| [battle-status-rules.test.js](../../server/node/test/battle-status-rules.test.js) | 123 |
| [character-name-policy.test.js](../../server/node/test/character-name-policy.test.js) | 80 |
| [cluster-account-authority.test.js](../../server/node/test/cluster-account-authority.test.js) | 215 |
| [cluster-account-service-boundary.test.js](../../server/node/test/cluster-account-service-boundary.test.js) | 304 |
| [cluster-battle-router.test.js](../../server/node/test/cluster-battle-router.test.js) | 480 |
| [cluster-battle-runtime.test.js](../../server/node/test/cluster-battle-runtime.test.js) | 250 |
| [cluster-event-runtime-config.test.js](../../server/node/test/cluster-event-runtime-config.test.js) | 241 |
| [currency-wallet.test.js](../../server/node/test/currency-wallet.test.js) | 70 |
| [default-http-public-edge.test.js](../../server/node/test/default-http-public-edge.test.js) | 90 |
| [demo-seed-script.test.js](../../server/node/test/demo-seed-script.test.js) | 136 |
| [durable-mutation-coordinator.test.js](../../server/node/test/durable-mutation-coordinator.test.js) | 357 |
| [durable-mutation-state.test.js](../../server/node/test/durable-mutation-state.test.js) | 354 |
| [equipment-envelope-consumed-ledger.test.js](../../server/node/test/equipment-envelope-consumed-ledger.test.js) | 213 |
| [equipment-envelope-registry.test.js](../../server/node/test/equipment-envelope-registry.test.js) | 427 |
| [equipment-profile-migration.test.js](../../server/node/test/equipment-profile-migration.test.js) | 698 |
| [equipment-profile-state.test.js](../../server/node/test/equipment-profile-state.test.js) | 471 |
| [equipment-trade-reservation.test.js](../../server/node/test/equipment-trade-reservation.test.js) | 93 |
| [equipment-transfer-envelope.test.js](../../server/node/test/equipment-transfer-envelope.test.js) | 571 |
| [event-cluster-relay.test.js](../../server/node/test/event-cluster-relay.test.js) | 257 |
| [event-hub.test.js](../../server/node/test/event-hub.test.js) | 3428 |
| [event-stream-cursor.test.js](../../server/node/test/event-stream-cursor.test.js) | 83 |
| [health-monitor.test.js](../../server/node/test/health-monitor.test.js) | 121 |
| [http-auth-boundary.test.js](../../server/node/test/http-auth-boundary.test.js) | 178 |
| [http-cluster-account-admission.test.js](../../server/node/test/http-cluster-account-admission.test.js) | 369 |
| [http-cluster-battle-routing.test.js](../../server/node/test/http-cluster-battle-routing.test.js) | 363 |
| [http-list-options.test.js](../../server/node/test/http-list-options.test.js) | 60 |
| [http-public-security.test.js](../../server/node/test/http-public-security.test.js) | 553 |
| [http-security-boundary.test.js](../../server/node/test/http-security-boundary.test.js) | 93 |
| [isolated-mysql-runtime.test.js](../../server/node/test/isolated-mysql-runtime.test.js) | 69 |
| [local-qa-gm-account.test.js](../../server/node/test/local-qa-gm-account.test.js) | 422 |
| [local-userdata-migration-script.test.js](../../server/node/test/local-userdata-migration-script.test.js) | 639 |
| [mail-archive-maintenance.test.js](../../server/node/test/mail-archive-maintenance.test.js) | 186 |
| [mail-archive-pagination.test.js](../../server/node/test/mail-archive-pagination.test.js) | 107 |
| [mail-archive-service.test.js](../../server/node/test/mail-archive-service.test.js) | 102 |
| [mail-attachment-state.test.js](../../server/node/test/mail-attachment-state.test.js) | 276 |
| [mail-authority-state.test.js](../../server/node/test/mail-authority-state.test.js) | 234 |
| [mail-center-summary.test.js](../../server/node/test/mail-center-summary.test.js) | 62 |
| [mail-inbox-pagination.test.js](../../server/node/test/mail-inbox-pagination.test.js) | 257 |
| [mail-lifecycle-state.test.js](../../server/node/test/mail-lifecycle-state.test.js) | 121 |
| [mail-read-consistency.test.js](../../server/node/test/mail-read-consistency.test.js) | 181 |
| [manual-encounter-access.test.js](../../server/node/test/manual-encounter-access.test.js) | 325 |
| [market-listing-state.test.js](../../server/node/test/market-listing-state.test.js) | 245 |
| [mysql-backup-artifact.test.js](../../server/node/test/mysql-backup-artifact.test.js) | 151 |
| [mysql-backup-health.test.js](../../server/node/test/mysql-backup-health.test.js) | 257 |
| [mysql-backup-restore-drill.test.js](../../server/node/test/mysql-backup-restore-drill.test.js) | 86 |
| [mysql-cluster-account-authority-read.test.js](../../server/node/test/mysql-cluster-account-authority-read.test.js) | 283 |
| [mysql-durable-receipt-read.test.js](../../server/node/test/mysql-durable-receipt-read.test.js) | 303 |
| [mysql-large-collection-journal.test.js](../../server/node/test/mysql-large-collection-journal.test.js) | 573 |
| [mysql-mail-active-limit-feature-enable.test.js](../../server/node/test/mysql-mail-active-limit-feature-enable.test.js) | 265 |
| [mysql-mail-archive-eligibility.test.js](../../server/node/test/mysql-mail-archive-eligibility.test.js) | 150 |
| [mysql-mail-archive-feature-enable.test.js](../../server/node/test/mysql-mail-archive-feature-enable.test.js) | 337 |
| [mysql-mail-archive-pagination.test.js](../../server/node/test/mysql-mail-archive-pagination.test.js) | 196 |
| [mysql-mail-archive-recovery.test.js](../../server/node/test/mysql-mail-archive-recovery.test.js) | 159 |
| [mysql-mail-archive-transaction.test.js](../../server/node/test/mysql-mail-archive-transaction.test.js) | 323 |
| [mysql-mail-claim-conditional-save.test.js](../../server/node/test/mysql-mail-claim-conditional-save.test.js) | 1029 |
| [mysql-mail-inbox-pagination.test.js](../../server/node/test/mysql-mail-inbox-pagination.test.js) | 499 |
| [mysql-mail-read-conditional-save.test.js](../../server/node/test/mysql-mail-read-conditional-save.test.js) | 228 |
| [mysql-mail-send-conditional-save.test.js](../../server/node/test/mysql-mail-send-conditional-save.test.js) | 1125 |
| [mysql-mail-storage-bootstrap-apply.test.js](../../server/node/test/mysql-mail-storage-bootstrap-apply.test.js) | 746 |
| [mysql-mail-storage-bootstrap-catalog.test.js](../../server/node/test/mysql-mail-storage-bootstrap-catalog.test.js) | 137 |
| [mysql-mail-storage-bootstrap-dry-run.test.js](../../server/node/test/mysql-mail-storage-bootstrap-dry-run.test.js) | 567 |
| [mysql-mail-storage-bootstrap-plan.test.js](../../server/node/test/mysql-mail-storage-bootstrap-plan.test.js) | 683 |
| [mysql-mail-storage-bootstrap-read.test.js](../../server/node/test/mysql-mail-storage-bootstrap-read.test.js) | 443 |
| [mysql-mail-storage-forward-maintenance.test.js](../../server/node/test/mysql-mail-storage-forward-maintenance.test.js) | 365 |
| [mysql-mail-storage-forward-writer.test.js](../../server/node/test/mysql-mail-storage-forward-writer.test.js) | 593 |
| [mysql-mail-storage-forward-writes.test.js](../../server/node/test/mysql-mail-storage-forward-writes.test.js) | 446 |
| [mysql-mail-storage-schema.test.js](../../server/node/test/mysql-mail-storage-schema.test.js) | 586 |
| [mysql-market-buy-conditional-save.test.js](../../server/node/test/mysql-market-buy-conditional-save.test.js) | 839 |
| [mysql-market-cancel-conditional-save.test.js](../../server/node/test/mysql-market-cancel-conditional-save.test.js) | 455 |
| [mysql-market-create-conditional-save.test.js](../../server/node/test/mysql-market-create-conditional-save.test.js) | 755 |
| [mysql-multi-store-concurrency.test.js](../../server/node/test/mysql-multi-store-concurrency.test.js) | 757 |
| [mysql-profile-conditional-save.test.js](../../server/node/test/mysql-profile-conditional-save.test.js) | 1384 |
| [mysql-profile-migration-script.test.js](../../server/node/test/mysql-profile-migration-script.test.js) | 442 |
| [mysql-resource-acquisition-order.test.js](../../server/node/test/mysql-resource-acquisition-order.test.js) | 1332 |
| [mysql-reward-vault-claim.test.js](../../server/node/test/mysql-reward-vault-claim.test.js) | 131 |
| [mysql-reward-vault-delivery.test.js](../../server/node/test/mysql-reward-vault-delivery.test.js) | 241 |
| [mysql-reward-vault-feature-enable.test.js](../../server/node/test/mysql-reward-vault-feature-enable.test.js) | 346 |
| [mysql-reward-vault-read.test.js](../../server/node/test/mysql-reward-vault-read.test.js) | 189 |
| [mysql-reward-vault-writes.test.js](../../server/node/test/mysql-reward-vault-writes.test.js) | 305 |
| [mysql-shared-asset-read.test.js](../../server/node/test/mysql-shared-asset-read.test.js) | 698 |
| [mysql-shared-transaction-integration.test.js](../../server/node/test/mysql-shared-transaction-integration.test.js) | 4022 |
| [mysql-transaction-deadline.test.js](../../server/node/test/mysql-transaction-deadline.test.js) | 318 |
| [mysql-transaction-guard.test.js](../../server/node/test/mysql-transaction-guard.test.js) | 323 |
| [network-admission.test.js](../../server/node/test/network-admission.test.js) | 228 |
| [new-pet-factory.test.js](../../server/node/test/new-pet-factory.test.js) | 388 |
| [online-player-appearance.test.js](../../server/node/test/online-player-appearance.test.js) | 148 |
| [online-presence.test.js](../../server/node/test/online-presence.test.js) | 213 |
| [pet-auto-capture-filter.test.js](../../server/node/test/pet-auto-capture-filter.test.js) | 422 |
| [pet-capture-candidate-authority.test.js](../../server/node/test/pet-capture-candidate-authority.test.js) | 441 |
| [pet-capture-shelter.test.js](../../server/node/test/pet-capture-shelter.test.js) | 362 |
| [pet-encounter-authority.test.js](../../server/node/test/pet-encounter-authority.test.js) | 481 |
| [pet-encounter-permit-authority.test.js](../../server/node/test/pet-encounter-permit-authority.test.js) | 206 |
| [pet-evolution-balance.test.js](../../server/node/test/pet-evolution-balance.test.js) | 106 |
| [pet-evolution-release-attestation.test.js](../../server/node/test/pet-evolution-release-attestation.test.js) | 80 |
| [pet-evolution-route-catalog.test.js](../../server/node/test/pet-evolution-route-catalog.test.js) | 202 |
| [pet-exp-service-integration.test.js](../../server/node/test/pet-exp-service-integration.test.js) | 530 |
| [pet-exp-settlement.test.js](../../server/node/test/pet-exp-settlement.test.js) | 394 |
| [pet-fusion-distribution.test.js](../../server/node/test/pet-fusion-distribution.test.js) | 101 |
| [pet-fusion-random-authority.test.js](../../server/node/test/pet-fusion-random-authority.test.js) | 96 |
| [pet-fusion-recipe-catalog.test.js](../../server/node/test/pet-fusion-recipe-catalog.test.js) | 685 |
| [pet-fusion-release-attestation.test.js](../../server/node/test/pet-fusion-release-attestation.test.js) | 514 |
| [pet-fusion-runtime-transaction-audit.test.js](../../server/node/test/pet-fusion-runtime-transaction-audit.test.js) | 146 |
| [pet-fusion-skill-policy.test.js](../../server/node/test/pet-fusion-skill-policy.test.js) | 611 |
| [pet-fusion.test.js](../../server/node/test/pet-fusion.test.js) | 495 |
| [pet-growth-authority.test.js](../../server/node/test/pet-growth-authority.test.js) | 285 |
| [pet-growth-catalog.test.js](../../server/node/test/pet-growth-catalog.test.js) | 382 |
| [pet-growth-evaluation-settings.test.js](../../server/node/test/pet-growth-evaluation-settings.test.js) | 165 |
| [pet-growth-legacy-save-audit.test.js](../../server/node/test/pet-growth-legacy-save-audit.test.js) | 82 |
| [pet-growth-quality-presentation.test.js](../../server/node/test/pet-growth-quality-presentation.test.js) | 160 |
| [pet-growth-runtime.test.js](../../server/node/test/pet-growth-runtime.test.js) | 587 |
| [pet-level-one-percentile.test.js](../../server/node/test/pet-level-one-percentile.test.js) | 104 |
| [pet-observed-growth-rule-preview.test.js](../../server/node/test/pet-observed-growth-rule-preview.test.js) | 215 |
| [pet-observed-growth-screening.test.js](../../server/node/test/pet-observed-growth-screening.test.js) | 247 |
| [pet-paid-reset-policy-catalog.test.js](../../server/node/test/pet-paid-reset-policy-catalog.test.js) | 370 |
| [pet-paid-reset.test.js](../../server/node/test/pet-paid-reset.test.js) | 350 |
| [pet-private-seed.test.js](../../server/node/test/pet-private-seed.test.js) | 73 |
| [pet-private-state.test.js](../../server/node/test/pet-private-state.test.js) | 109 |
| [pet-protection-policy.test.js](../../server/node/test/pet-protection-policy.test.js) | 333 |
| [pet-rebirth-balance.test.js](../../server/node/test/pet-rebirth-balance.test.js) | 140 |
| [pet-rebirth-growth-cycle.test.js](../../server/node/test/pet-rebirth-growth-cycle.test.js) | 209 |
| [pet-ride-permit.test.js](../../server/node/test/pet-ride-permit.test.js) | 50 |
| [pet-service-access.test.js](../../server/node/test/pet-service-access.test.js) | 504 |
| [pet-skill-loadout.test.js](../../server/node/test/pet-skill-loadout.test.js) | 62 |
| [pet-tame-permit.test.js](../../server/node/test/pet-tame-permit.test.js) | 56 |
| [pet-terminal-path.test.js](../../server/node/test/pet-terminal-path.test.js) | 120 |
| [player-appearance-catalog.test.js](../../server/node/test/player-appearance-catalog.test.js) | 58 |
| [player-level-runtime.test.js](../../server/node/test/player-level-runtime.test.js) | 68 |
| [profile-migration-backup.test.js](../../server/node/test/profile-migration-backup.test.js) | 206 |
| [profile-migration-batch-ops.test.js](../../server/node/test/profile-migration-batch-ops.test.js) | 520 |
| [profile-migrations.test.js](../../server/node/test/profile-migrations.test.js) | 519 |
| [progression-leveling-soak.test.js](../../server/node/test/progression-leveling-soak.test.js) | 48 |
| [progression-route-catalog.test.js](../../server/node/test/progression-route-catalog.test.js) | 119 |
| [protocol-version.test.js](../../server/node/test/protocol-version.test.js) | 68 |
| [public-edge-runtime-config.test.js](../../server/node/test/public-edge-runtime-config.test.js) | 94 |
| [reward-vault-pagination.test.js](../../server/node/test/reward-vault-pagination.test.js) | 140 |
| [reward-vault-state.test.js](../../server/node/test/reward-vault-state.test.js) | 243 |
| [runtime-battle-recovery.test.js](../../server/node/test/runtime-battle-recovery.test.js) | 114 |
| [runtime-hot-collections-integration.test.js](../../server/node/test/runtime-hot-collections-integration.test.js) | 214 |
| [runtime-invite-boundary.test.js](../../server/node/test/runtime-invite-boundary.test.js) | 61 |
| [server-ops-lifecycle.test.js](../../server/node/test/server-ops-lifecycle.test.js) | 628 |
| [server-profile-public-v2-vector.test.js](../../server/node/test/server-profile-public-v2-vector.test.js) | 93 |
| [shared-asset-read-model.test.js](../../server/node/test/shared-asset-read-model.test.js) | 651 |
| [shared-mysql-transaction-harness.test.js](../../server/node/test/shared-mysql-transaction-harness.test.js) | 442 |
| [start-backend-launcher.test.js](../../server/node/test/start-backend-launcher.test.js) | 440 |
| [valkey-account-owner.test.js](../../server/node/test/valkey-account-owner.test.js) | 404 |
| [valkey-battle-runtime-store.test.js](../../server/node/test/valkey-battle-runtime-store.test.js) | 296 |
| [valkey-stream-event-bridge-live.test.js](../../server/node/test/valkey-stream-event-bridge-live.test.js) | 133 |
| [valkey-stream-event-bridge.test.js](../../server/node/test/valkey-stream-event-bridge.test.js) | 367 |
| [websocket-frame-parser.test.js](../../server/node/test/websocket-frame-parser.test.js) | 346 |
| [wild-capture-growth-selection.test.js](../../server/node/test/wild-capture-growth-selection.test.js) | 172 |

</details>

## server/node/test-support

<details><summary>8 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [auth-service-test-context.js](../../server/node/test-support/auth-service-test-context.js) | 710 |
| [authoritative-map-test-fixture.js](../../server/node/test-support/authoritative-map-test-fixture.js) | 222 |
| [mysql-mail-storage-fixture.js](../../server/node/test-support/mysql-mail-storage-fixture.js) | 55 |
| [pet-evolution-fixture.js](../../server/node/test-support/pet-evolution-fixture.js) | 197 |
| [pet-fusion-fixture.js](../../server/node/test-support/pet-fusion-fixture.js) | 565 |
| [pet-paid-reset-fixture.js](../../server/node/test-support/pet-paid-reset-fixture.js) | 182 |
| [selected-character-fixture.js](../../server/node/test-support/selected-character-fixture.js) | 84 |
| [shared-mysql-transaction-harness.js](../../server/node/test-support/shared-mysql-transaction-harness.js) | 966 |

</details>

## tools

<details><summary>99 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [audit_firebud_hud_glyph_stability.py](../../tools/audit_firebud_hud_glyph_stability.py) | 734 |
| [audit_map_awakened_assets.py](../../tools/audit_map_awakened_assets.py) | 499 |
| [audit_pet_battle_catalog.py](../../tools/audit_pet_battle_catalog.py) | 506 |
| [audit_pet_battle_release_gate.py](../../tools/audit_pet_battle_release_gate.py) | 1501 |
| [audit_pet_portrait_catalog.py](../../tools/audit_pet_portrait_catalog.py) | 5008 |
| [audit_release_candidate.mjs](../../tools/audit_release_candidate.mjs) | 1015 |
| [audit_world_hud_awakened_assets.py](../../tools/audit_world_hud_awakened_assets.py) | 534 |
| [battle_action_catalog_check.mjs](../../tools/battle_action_catalog_check.mjs) | 933 |
| [build_mounted_keypose_board.py](../../tools/build_mounted_keypose_board.py) | 178 |
| [build_mounted_sprite_qa.py](../../tools/build_mounted_sprite_qa.py) | 338 |
| [build_npc_art_bundle.py](../../tools/build_npc_art_bundle.py) | 3939 |
| [build_pet_action_contact_sheet.py](../../tools/build_pet_action_contact_sheet.py) | 82 |
| [build_pet_art_bundle.py](../../tools/build_pet_art_bundle.py) | 1634 |
| [build_pet_portrait.py](../../tools/build_pet_portrait.py) | 8789 |
| [capture_battle_layout_perf.py](../../tools/capture_battle_layout_perf.py) | 1782 |
| [capture_map_awakened_perf.py](../../tools/capture_map_awakened_perf.py) | 3874 |
| [capture_npc_main_review.py](../../tools/capture_npc_main_review.py) | 1048 |
| [cleanup_sprite_alpha_components.py](../../tools/cleanup_sprite_alpha_components.py) | 106 |
| [combine_npc_staged_review.py](../../tools/combine_npc_staged_review.py) | 602 |
| [finalize_pet_identity_gate.py](../../tools/finalize_pet_identity_gate.py) | 1897 |
| [godot_qa_user_data_lane.py](../../tools/godot_qa_user_data_lane.py) | 3729 |
| [install_firebud_computer_use_evidence.py](../../tools/install_firebud_computer_use_evidence.py) | 510 |
| [install_pet_battle_bundle.py](../../tools/install_pet_battle_bundle.py) | 1489 |
| [lib/isolated-mysql-runtime.mjs](../../tools/lib/isolated-mysql-runtime.mjs) | 296 |
| [lib/macos-host-evidence.mjs](../../tools/lib/macos-host-evidence.mjs) | 1580 |
| [lib/public-capacity-harness.mjs](../../tools/lib/public-capacity-harness.mjs) | 646 |
| [map_performance_batch.py](../../tools/map_performance_batch.py) | 204 |
| [map_performance_batch_contract.py](../../tools/map_performance_batch_contract.py) | 173 |
| [map_visual_evidence_builder.py](../../tools/map_visual_evidence_builder.py) | 2060 |
| [normalize_mounted_sprite_frames.py](../../tools/normalize_mounted_sprite_frames.py) | 198 |
| [p0_6_equipment_ownership_registry_gate.mjs](../../tools/p0_6_equipment_ownership_registry_gate.mjs) | 316 |
| [p0_6_large_collection_journal_gate.mjs](../../tools/p0_6_large_collection_journal_gate.mjs) | 778 |
| [p0_6_planner_touched_set_gate.mjs](../../tools/p0_6_planner_touched_set_gate.mjs) | 510 |
| [p0_6_presence_ws_gate.mjs](../../tools/p0_6_presence_ws_gate.mjs) | 1470 |
| [p0_6_public_capacity_soak.mjs](../../tools/p0_6_public_capacity_soak.mjs) | 7617 |
| [p0_6_tombstone_capacity_gate.mjs](../../tools/p0_6_tombstone_capacity_gate.mjs) | 283 |
| [p0_6d_mysql_session_deadline_gate.mjs](../../tools/p0_6d_mysql_session_deadline_gate.mjs) | 486 |
| [p0_6d_profile_parallel_mysql_gate.mjs](../../tools/p0_6d_profile_parallel_mysql_gate.mjs) | 5575 |
| [pet_art_batch_audit.py](../../tools/pet_art_batch_audit.py) | 2975 |
| [pet_evolution_balance_audit.mjs](../../tools/pet_evolution_balance_audit.mjs) | 188 |
| [pet_evolution_eligibility_audit.mjs](../../tools/pet_evolution_eligibility_audit.mjs) | 199 |
| [pet_evolution_route_audit.mjs](../../tools/pet_evolution_route_audit.mjs) | 247 |
| [pet_fusion_candidate_growth_audit.mjs](../../tools/pet_fusion_candidate_growth_audit.mjs) | 609 |
| [pet_growth_legacy_save_audit.mjs](../../tools/pet_growth_legacy_save_audit.mjs) | 262 |
| [pet_growth_population_audit.mjs](../../tools/pet_growth_population_audit.mjs) | 312 |
| [pet_identity_replay_contract.py](../../tools/pet_identity_replay_contract.py) | 46 |
| [pet_level_one_percentile_audit.mjs](../../tools/pet_level_one_percentile_audit.mjs) | 158 |
| [pet_rebirth_balance_audit.mjs](../../tools/pet_rebirth_balance_audit.mjs) | 260 |
| [pet_rebirth_evaluation_audit.mjs](../../tools/pet_rebirth_evaluation_audit.mjs) | 338 |
| [pet_wild_capture_growth_audit.mjs](../../tools/pet_wild_capture_growth_audit.mjs) | 330 |
| [play_guardian_review.py](../../tools/play_guardian_review.py) | 173 |
| [prepare_npc_blind_review_packet.py](../../tools/prepare_npc_blind_review_packet.py) | 648 |
| [progression_leveling_soak.mjs](../../tools/progression_leveling_soak.mjs) | 45 |
| [progression_route_audit.mjs](../../tools/progression_route_audit.mjs) | 46 |
| [promote_map_visual_release.py](../../tools/promote_map_visual_release.py) | 1148 |
| [promote_npc_art_release.py](../../tools/promote_npc_art_release.py) | 1030 |
| [promote_pet_battle_release_cache.py](../../tools/promote_pet_battle_release_cache.py) | 230 |
| [promote_pet_fusion_runtime_release.py](../../tools/promote_pet_fusion_runtime_release.py) | 1269 |
| [record_backpack_awakened_owner_review.py](../../tools/record_backpack_awakened_owner_review.py) | 592 |
| [record_battle_layout_owner_review.py](../../tools/record_battle_layout_owner_review.py) | 3710 |
| [record_battle_outcome_owner_review.py](../../tools/record_battle_outcome_owner_review.py) | 722 |
| [record_character_entry_owner_review.py](../../tools/record_character_entry_owner_review.py) | 724 |
| [record_commerce_awakened_owner_review.py](../../tools/record_commerce_awakened_owner_review.py) | 769 |
| [record_earth_vein_landmark_review.py](../../tools/record_earth_vein_landmark_review.py) | 399 |
| [record_earth_vein_review_batch.py](../../tools/record_earth_vein_review_batch.py) | 2708 |
| [record_firebud_v2_owner_review.py](../../tools/record_firebud_v2_owner_review.py) | 1365 |
| [record_hang_matchmaking_owner_review.py](../../tools/record_hang_matchmaking_owner_review.py) | 699 |
| [record_hang_matchmaking_world_hud_owner_review.py](../../tools/record_hang_matchmaking_world_hud_owner_review.py) | 889 |
| [record_map_awakened_owner_review.py](../../tools/record_map_awakened_owner_review.py) | 995 |
| [record_map_visual_action_captures.py](../../tools/record_map_visual_action_captures.py) | 4698 |
| [record_market_awakened_owner_review.py](../../tools/record_market_awakened_owner_review.py) | 615 |
| [record_npc_direction_review.py](../../tools/record_npc_direction_review.py) | 993 |
| [record_pet_codex_awakened_owner_review.py](../../tools/record_pet_codex_awakened_owner_review.py) | 1303 |
| [record_pet_fusion_closed_review.py](../../tools/record_pet_fusion_closed_review.py) | 3432 |
| [record_pet_fusion_main_owner_review.py](../../tools/record_pet_fusion_main_owner_review.py) | 1537 |
| [record_pet_management_owner_review.py](../../tools/record_pet_management_owner_review.py) | 3116 |
| [record_player_character_owner_review.py](../../tools/record_player_character_owner_review.py) | 628 |
| [record_world_direction_review.py](../../tools/record_world_direction_review.py) | 1605 |
| [record_world_hud_owner_review.py](../../tools/record_world_hud_owner_review.py) | 706 |
| [refresh_map_visual_action_evidence.py](../../tools/refresh_map_visual_action_evidence.py) | 439 |
| [register_fusion_pet_closed_assets.py](../../tools/register_fusion_pet_closed_assets.py) | 2254 |
| [repack_chroma_sprite_grid.py](../../tools/repack_chroma_sprite_grid.py) | 221 |
| [repository_guide.mjs](../../tools/repository_guide.mjs) | 204 |
| [review_capture_render_continuity.py](../../tools/review_capture_render_continuity.py) | 31 |
| [run_firebud_v2_performance_evidence.py](../../tools/run_firebud_v2_performance_evidence.py) | 537 |
| [run_godot_auto_checks.mjs](../../tools/run_godot_auto_checks.mjs) | 3280 |
| [run_local_ci.mjs](../../tools/run_local_ci.mjs) | 448 |
| [run_map_visual_performance_evidence.py](../../tools/run_map_visual_performance_evidence.py) | 522 |
| [run_map_visual_preexport_gate.py](../../tools/run_map_visual_preexport_gate.py) | 146 |
| [run_mysql_backup_restore_drill.mjs](../../tools/run_mysql_backup_restore_drill.mjs) | 689 |
| [run_pet_battle_export_gate.py](../../tools/run_pet_battle_export_gate.py) | 5412 |
| [run_trusted_tls_edge_gate.mjs](../../tools/run_trusted_tls_edge_gate.mjs) | 923 |
| [run_valkey_event_bridge_live_gate.mjs](../../tools/run_valkey_event_bridge_live_gate.mjs) | 373 |
| [run_valkey_two_node_capacity_soak.mjs](../../tools/run_valkey_two_node_capacity_soak.mjs) | 1558 |
| [run_valkey_two_node_event_gate.mjs](../../tools/run_valkey_two_node_event_gate.mjs) | 4381 |
| [sprite_alpha_despill.py](../../tools/sprite_alpha_despill.py) | 663 |
| [stage_pet_battle_bundle.py](../../tools/stage_pet_battle_bundle.py) | 704 |
| [verify_pet_fusion_closed_release.py](../../tools/verify_pet_fusion_closed_release.py) | 3302 |
| [world_semantic_approval.py](../../tools/world_semantic_approval.py) | 2032 |

</details>

## tools/tests

<details><summary>62 个文件</summary>

| 文件 | 行数 |
| --- | ---: |
| [tools/test/audit_release_candidate.test.mjs](../../tools/test/audit_release_candidate.test.mjs) | 129 |
| [tools/test/pet_fusion_candidate_growth_audit.test.mjs](../../tools/test/pet_fusion_candidate_growth_audit.test.mjs) | 186 |
| [tools/test/repository_guide.test.mjs](../../tools/test/repository_guide.test.mjs) | 97 |
| [tools/test/run_godot_auto_checks.test.mjs](../../tools/test/run_godot_auto_checks.test.mjs) | 2028 |
| [tools/test/run_local_ci.test.mjs](../../tools/test/run_local_ci.test.mjs) | 89 |
| [tools/test/test_assemble_firebud_surface_autotile_sheet.py](../../tools/test/test_assemble_firebud_surface_autotile_sheet.py) | 125 |
| [tools/test/test_audit_firebud_hud_glyph_stability.py](../../tools/test/test_audit_firebud_hud_glyph_stability.py) | 151 |
| [tools/test/test_audit_map_awakened_assets.py](../../tools/test/test_audit_map_awakened_assets.py) | 96 |
| [tools/test/test_audit_pet_battle_catalog.py](../../tools/test/test_audit_pet_battle_catalog.py) | 393 |
| [tools/test/test_audit_pet_battle_release_gate.py](../../tools/test/test_audit_pet_battle_release_gate.py) | 700 |
| [tools/test/test_audit_pet_portrait_catalog.py](../../tools/test/test_audit_pet_portrait_catalog.py) | 2107 |
| [tools/test/test_audit_world_hud_awakened_assets.py](../../tools/test/test_audit_world_hud_awakened_assets.py) | 78 |
| [tools/test/test_battle_layout_safe_area_contract.py](../../tools/test/test_battle_layout_safe_area_contract.py) | 768 |
| [tools/test/test_build_earth_vein_computer_use_evidence.py](../../tools/test/test_build_earth_vein_computer_use_evidence.py) | 70 |
| [tools/test/test_build_firebud_ground_atlas_v4.py](../../tools/test/test_build_firebud_ground_atlas_v4.py) | 288 |
| [tools/test/test_build_pet_art_bundle.py](../../tools/test/test_build_pet_art_bundle.py) | 899 |
| [tools/test/test_build_pet_portrait.py](../../tools/test/test_build_pet_portrait.py) | 4718 |
| [tools/test/test_capture_battle_layout_perf.py](../../tools/test/test_capture_battle_layout_perf.py) | 2653 |
| [tools/test/test_capture_map_awakened_perf.py](../../tools/test/test_capture_map_awakened_perf.py) | 2961 |
| [tools/test/test_capture_npc_main_review.py](../../tools/test/test_capture_npc_main_review.py) | 652 |
| [tools/test/test_combine_npc_staged_review.py](../../tools/test/test_combine_npc_staged_review.py) | 302 |
| [tools/test/test_finalize_pet_identity_gate.py](../../tools/test/test_finalize_pet_identity_gate.py) | 1057 |
| [tools/test/test_godot_qa_user_data_lane.py](../../tools/test/test_godot_qa_user_data_lane.py) | 2199 |
| [tools/test/test_install_firebud_computer_use_evidence.py](../../tools/test/test_install_firebud_computer_use_evidence.py) | 90 |
| [tools/test/test_install_pet_battle_bundle.py](../../tools/test/test_install_pet_battle_bundle.py) | 1330 |
| [tools/test/test_map_performance_batch.py](../../tools/test/test_map_performance_batch.py) | 179 |
| [tools/test/test_map_visual_evidence_builder.py](../../tools/test/test_map_visual_evidence_builder.py) | 1439 |
| [tools/test/test_map_visual_release_tools.py](../../tools/test/test_map_visual_release_tools.py) | 484 |
| [tools/test/test_pet_art_batch_audit.py](../../tools/test/test_pet_art_batch_audit.py) | 1793 |
| [tools/test/test_pet_battle_export_gate.py](../../tools/test/test_pet_battle_export_gate.py) | 4927 |
| [tools/test/test_play_guardian_review.py](../../tools/test/test_play_guardian_review.py) | 83 |
| [tools/test/test_prepare_npc_blind_review_packet.py](../../tools/test/test_prepare_npc_blind_review_packet.py) | 470 |
| [tools/test/test_promote_pet_fusion_runtime_release.py](../../tools/test/test_promote_pet_fusion_runtime_release.py) | 274 |
| [tools/test/test_record_backpack_awakened_owner_review.py](../../tools/test/test_record_backpack_awakened_owner_review.py) | 195 |
| [tools/test/test_record_battle_layout_owner_review.py](../../tools/test/test_record_battle_layout_owner_review.py) | 2247 |
| [tools/test/test_record_battle_outcome_owner_review.py](../../tools/test/test_record_battle_outcome_owner_review.py) | 229 |
| [tools/test/test_record_character_entry_owner_review.py](../../tools/test/test_record_character_entry_owner_review.py) | 250 |
| [tools/test/test_record_commerce_awakened_owner_review.py](../../tools/test/test_record_commerce_awakened_owner_review.py) | 284 |
| [tools/test/test_record_earth_vein_landmark_review.py](../../tools/test/test_record_earth_vein_landmark_review.py) | 124 |
| [tools/test/test_record_earth_vein_review_batch.py](../../tools/test/test_record_earth_vein_review_batch.py) | 1000 |
| [tools/test/test_record_firebud_v2_owner_review.py](../../tools/test/test_record_firebud_v2_owner_review.py) | 632 |
| [tools/test/test_record_hang_matchmaking_owner_review.py](../../tools/test/test_record_hang_matchmaking_owner_review.py) | 234 |
| [tools/test/test_record_hang_matchmaking_world_hud_owner_review.py](../../tools/test/test_record_hang_matchmaking_world_hud_owner_review.py) | 516 |
| [tools/test/test_record_map_awakened_owner_review.py](../../tools/test/test_record_map_awakened_owner_review.py) | 340 |
| [tools/test/test_record_map_visual_action_captures.py](../../tools/test/test_record_map_visual_action_captures.py) | 1926 |
| [tools/test/test_record_market_awakened_owner_review.py](../../tools/test/test_record_market_awakened_owner_review.py) | 228 |
| [tools/test/test_record_npc_direction_review.py](../../tools/test/test_record_npc_direction_review.py) | 276 |
| [tools/test/test_record_pet_codex_awakened_owner_review.py](../../tools/test/test_record_pet_codex_awakened_owner_review.py) | 785 |
| [tools/test/test_record_pet_fusion_closed_review.py](../../tools/test/test_record_pet_fusion_closed_review.py) | 1296 |
| [tools/test/test_record_pet_fusion_main_owner_review.py](../../tools/test/test_record_pet_fusion_main_owner_review.py) | 524 |
| [tools/test/test_record_pet_management_owner_review.py](../../tools/test/test_record_pet_management_owner_review.py) | 1851 |
| [tools/test/test_record_player_character_owner_review.py](../../tools/test/test_record_player_character_owner_review.py) | 230 |
| [tools/test/test_record_world_direction_review.py](../../tools/test/test_record_world_direction_review.py) | 535 |
| [tools/test/test_record_world_hud_owner_review.py](../../tools/test/test_record_world_hud_owner_review.py) | 256 |
| [tools/test/test_refresh_map_visual_action_evidence.py](../../tools/test/test_refresh_map_visual_action_evidence.py) | 105 |
| [tools/test/test_register_fusion_pet_closed_assets.py](../../tools/test/test_register_fusion_pet_closed_assets.py) | 1126 |
| [tools/test/test_run_firebud_v2_performance_evidence.py](../../tools/test/test_run_firebud_v2_performance_evidence.py) | 103 |
| [tools/test/test_run_map_visual_performance_evidence.py](../../tools/test/test_run_map_visual_performance_evidence.py) | 593 |
| [tools/test/test_stage_pet_battle_bundle.py](../../tools/test/test_stage_pet_battle_bundle.py) | 351 |
| [tools/test/test_verify_pet_fusion_closed_release.py](../../tools/test/test_verify_pet_fusion_closed_release.py) | 2134 |
| [tools/test/test_world_semantic_approval.py](../../tools/test/test_world_semantic_approval.py) | 1202 |
| [tools/test_build_npc_art_bundle.py](../../tools/test_build_npc_art_bundle.py) | 3055 |

</details>

## 共享数据

数值、地图和目录的 JSON 由双端消费；改变字段或 ID 前须查客户端与服务端读取方。

<details><summary>全部共享 JSON</summary>

- [artisan_manor_map.json](../../client/godot/data/artisan_manor_map.json)
- [audio_ambience_release_gate_v1.json](../../client/godot/data/audio_ambience_release_gate_v1.json)
- [bag_items.json](../../client/godot/data/bag_items.json)
- [balance/balance_sets.json](../../client/godot/data/balance/balance_sets.json)
- [balance/battle_simulation_scenarios.json](../../client/godot/data/balance/battle_simulation_scenarios.json)
- [balance/capture_formula.json](../../client/godot/data/balance/capture_formula.json)
- [balance/combat_formulas.json](../../client/godot/data/balance/combat_formulas.json)
- [balance/economy_ledger_scenarios.json](../../client/godot/data/balance/economy_ledger_scenarios.json)
- [balance/level_curves.json](../../client/godot/data/balance/level_curves.json)
- [balance/pet_evolution_balance.json](../../client/godot/data/balance/pet_evolution_balance.json)
- [balance/pet_growth_profiles.json](../../client/godot/data/balance/pet_growth_profiles.json)
- [balance/pet_growth_quality_presentation.json](../../client/godot/data/balance/pet_growth_quality_presentation.json)
- [balance/pet_growth_species_profiles.json](../../client/godot/data/balance/pet_growth_species_profiles.json)
- [balance/pet_paid_reset_policy.json](../../client/godot/data/balance/pet_paid_reset_policy.json)
- [balance/pet_rebirth_balance.json](../../client/godot/data/balance/pet_rebirth_balance.json)
- [balance/player_growth.json](../../client/godot/data/balance/player_growth.json)
- [balance/progression_zones.json](../../client/godot/data/balance/progression_zones.json)
- [balance/reward_economy.json](../../client/godot/data/balance/reward_economy.json)
- [battle_actions.json](../../client/godot/data/battle_actions.json)
- [battle_boss_mechanics.json](../../client/godot/data/battle_boss_mechanics.json)
- [battle_passive_skills.json](../../client/godot/data/battle_passive_skills.json)
- [battle_rewards.json](../../client/godot/data/battle_rewards.json)
- [beast_pen_manor_map.json](../../client/godot/data/beast_pen_manor_map.json)
- [capture_tools.json](../../client/godot/data/capture_tools.json)
- [character_name_policy.json](../../client/godot/data/character_name_policy.json)
- [earth_vein_cave_f2_map.json](../../client/godot/data/earth_vein_cave_f2_map.json)
- [earth_vein_cave_f3_map.json](../../client/godot/data/earth_vein_cave_f3_map.json)
- [earth_vein_cave_f4_map.json](../../client/godot/data/earth_vein_cave_f4_map.json)
- [earth_vein_cave_map.json](../../client/godot/data/earth_vein_cave_map.json)
- [earth_vein_manor_map.json](../../client/godot/data/earth_vein_manor_map.json)
- [ember_core_cave_f2_map.json](../../client/godot/data/ember_core_cave_f2_map.json)
- [ember_core_cave_f3_map.json](../../client/godot/data/ember_core_cave_f3_map.json)
- [ember_core_cave_f4_map.json](../../client/godot/data/ember_core_cave_f4_map.json)
- [ember_core_cave_map.json](../../client/godot/data/ember_core_cave_map.json)
- [ember_core_manor_map.json](../../client/godot/data/ember_core_manor_map.json)
- [equipment_items.json](../../client/godot/data/equipment_items.json)
- [equipment_synthesis_recipes.json](../../client/godot/data/equipment_synthesis_recipes.json)
- [firebud_manor_map.json](../../client/godot/data/firebud_manor_map.json)
- [firebud_training_map.json](../../client/godot/data/firebud_training_map.json)
- [firebud_village_gate_map.json](../../client/godot/data/firebud_village_gate_map.json)
- [gale_breath_cave_f2_map.json](../../client/godot/data/gale_breath_cave_f2_map.json)
- [gale_breath_cave_f3_map.json](../../client/godot/data/gale_breath_cave_f3_map.json)
- [gale_breath_cave_f4_map.json](../../client/godot/data/gale_breath_cave_f4_map.json)
- [gale_breath_cave_map.json](../../client/godot/data/gale_breath_cave_map.json)
- [gale_breath_manor_map.json](../../client/godot/data/gale_breath_manor_map.json)
- [gm_10v10_training_ground_map.json](../../client/godot/data/gm_10v10_training_ground_map.json)
- [gm_qa_access_policy.json](../../client/godot/data/gm_qa_access_policy.json)
- [item_shops.json](../../client/godot/data/item_shops.json)
- [level_grass_trial_ground_map.json](../../client/godot/data/level_grass_trial_ground_map.json)
- [manors.json](../../client/godot/data/manors.json)
- [map_regions.json](../../client/godot/data/map_regions.json)
- [map_visual_catalog.json](../../client/godot/data/map_visual_catalog.json)
- [map_visual_review_catalog.json](../../client/godot/data/map_visual_review_catalog.json)
- [mistcap_marsh_map.json](../../client/godot/data/mistcap_marsh_map.json)
- [mount_visual_profiles.json](../../client/godot/data/mount_visual_profiles.json)
- [npc_appearances.json](../../client/godot/data/npc_appearances.json)
- [pet_art_catalog.json](../../client/godot/data/pet_art_catalog.json)
- [pet_battle_release_registry_v1.json](../../client/godot/data/pet_battle_release_registry_v1.json)
- [pet_battle_release_runtime_cache_v1.json](../../client/godot/data/pet_battle_release_runtime_cache_v1.json)
- [pet_battle_sprite_scales.json](../../client/godot/data/pet_battle_sprite_scales.json)
- [pet_bui_charge_vfx_release_gate_v1.json](../../client/godot/data/pet_bui_charge_vfx_release_gate_v1.json)
- [pet_evolution_release_attestation_v1.json](../../client/godot/data/pet_evolution_release_attestation_v1.json)
- [pet_evolution_routes.json](../../client/godot/data/pet_evolution_routes.json)
- [pet_evolution_runtime_release_owner_decision_v1.json](../../client/godot/data/pet_evolution_runtime_release_owner_decision_v1.json)
- [pet_fusion_recipes.json](../../client/godot/data/pet_fusion_recipes.json)
- [pet_fusion_visual_owner_decision_v1.json](../../client/godot/data/pet_fusion_visual_owner_decision_v1.json)
- [pet_skill_training.json](../../client/godot/data/pet_skill_training.json)
- [pet_templates.json](../../client/godot/data/pet_templates.json)
- [player_appearances.json](../../client/godot/data/player_appearances.json)
- [quests.json](../../client/godot/data/quests.json)
- [rebirth_trials.json](../../client/godot/data/rebirth_trials.json)
- [shadow_oath_cavern_f2_map.json](../../client/godot/data/shadow_oath_cavern_f2_map.json)
- [shadow_oath_cavern_f3_map.json](../../client/godot/data/shadow_oath_cavern_f3_map.json)
- [shadow_oath_cavern_f4_map.json](../../client/godot/data/shadow_oath_cavern_f4_map.json)
- [shadow_oath_cavern_f5_map.json](../../client/godot/data/shadow_oath_cavern_f5_map.json)
- [shadow_oath_cavern_map.json](../../client/godot/data/shadow_oath_cavern_map.json)
- [shadow_oath_manor_map.json](../../client/godot/data/shadow_oath_manor_map.json)
- [suncrack_badlands_map.json](../../client/godot/data/suncrack_badlands_map.json)
- [tide_echo_cave_f2_map.json](../../client/godot/data/tide_echo_cave_f2_map.json)
- [tide_echo_cave_f3_map.json](../../client/godot/data/tide_echo_cave_f3_map.json)
- [tide_echo_cave_f4_map.json](../../client/godot/data/tide_echo_cave_f4_map.json)
- [tide_echo_cave_map.json](../../client/godot/data/tide_echo_cave_map.json)
- [tide_echo_manor_map.json](../../client/godot/data/tide_echo_manor_map.json)
- [training_manor_map.json](../../client/godot/data/training_manor_map.json)
- [windglass_highlands_map.json](../../client/godot/data/windglass_highlands_map.json)
- [world_semantic_direction_approval_crystal_wuli_v1.json](../../client/godot/data/world_semantic_direction_approval_crystal_wuli_v1.json)
- [world_semantic_direction_approval_v1.json](../../client/godot/data/world_semantic_direction_approval_v1.json)
- [world_semantic_direction_approval_v2.json](../../client/godot/data/world_semantic_direction_approval_v2.json)

</details>
