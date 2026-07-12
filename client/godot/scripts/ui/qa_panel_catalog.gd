extends RefCounted


static func entry_definitions(speed_multiplier: int) -> Array[Dictionary]:
	var entries: Array[Dictionary] = []
	entries.append({"section": "核心测试档"})
	entries.append({"id": "gm_prepare_qa_profile", "label": "补齐核心测试档", "description": "只补齐缺少的货币与物资，不会清空现有进度"})
	entries.append({"id": "gm_prepare_qa_pet_samples", "label": "准备宠物样本档", "description": "10只Lv1蓝人龙 + 3只Lv20对照；需13空位"})
	entries.append({"id": "gm_prepare_qa_assets", "label": "准备装备与全物品档", "description": "76种物品（含31件正式装备）；银行至少保留1格"})
	entries.append({"section": "GM地图"})
	entries.append({"id": "gm_map", "label": "进入GM测试场", "description": "完整客户端 + 三块专用测试草丛"})
	entries.append({"id": "gm_10v10_grass", "label": "10V10草丛", "description": "固定10只，测练级、合击、自动战斗"})
	entries.append({"id": "gm_capture_grass", "label": "捉宠草丛", "description": "随机图鉴宠，1-5只，Lv1-10"})
	entries.append({"id": "gm_knockaway_grass", "label": "击飞草丛", "description": "120-140级怪，测记录点回城"})
	entries.append({"id": "firebud_village", "label": "回火芽村", "description": "回到村口，测商店、村医、记录点"})
	entries.append({"section": "GM工具"})
	entries.append({"id": "gm_battle_speed_gear", "label": "变速齿轮 x%d" % speed_multiplier, "description": "战斗和走路 x2-x10，x1关闭"})
	entries.append({"id": "open_numeric_workbench", "label": "数值实验", "description": "成长、MM转宠、战斗批量模拟"})
	entries.append({"section": "功能面板"})
	entries.append({"id": "open_backpack", "label": "背包", "description": "道具、装备、世界使用"})
	entries.append({"id": "open_item_shop", "label": "杂货铺", "description": "购买、出售、数量输入"})
	entries.append({"id": "open_equipment_shop", "label": "装备铺", "description": "装备购买预览、购买后装备"})
	entries.append({"id": "open_equipment", "label": "装备栏", "description": "槽位详情、卸下、强化、合成"})
	entries.append({"id": "open_bank", "label": "银行", "description": "全物品目录、具体装备实例、存取"})
	entries.append({"id": "open_market", "label": "交易所", "description": "具体装备上架、撤单、购买"})
	entries.append({"id": "open_mailbox", "label": "邮箱", "description": "装备附件展示与权威领取"})
	entries.append({"id": "open_quest", "label": "任务", "description": "任务详情、奖励、自动寻路"})
	entries.append({"id": "open_auto_battle", "label": "内挂战斗", "description": "人物/宠物首回合与一般回合策略"})
	entries.append({"id": "open_auto_capture", "label": "内挂捕捉", "description": "捕捉目标、等级、工具、低战力丢弃"})
	entries.append({"id": "open_partner", "label": "陪练伙伴", "description": "补满5人5宠测试合击"})
	entries.append({"id": "open_pet", "label": "宠物", "description": "队伍、兽栏、图鉴、成长"})
	entries.append({"id": "open_stable", "label": "兽栏", "description": "GM测试存取，等同站在村内兽栏旁"})
	entries.append({"id": "open_rebirth_preview", "label": "转生预览", "description": "查看人物转生资格和能力预览"})
	entries.append({"id": "open_codex", "label": "图鉴", "description": "已见、可捕、捕获记录"})
	return entries


static func command_summary_text() -> String:
	var lines: Array[String] = []
	lines.append("[color=#d7c36a]常用自测命令[/color]")
	lines.append("背包: --auto-backpack-check / --auto-backpack-world-use-check / --auto-backpack-filter-check")
	lines.append("商店: --auto-shop-check / --auto-equipment-shop-preview-check")
	lines.append("装备: --auto-equipment-check / --auto-equipment-instance-check / --auto-equipment-growth-check / --auto-equipment-durability-check / --auto-equipment-synthesis-check")
	lines.append("任务: --auto-quest-chain-check / --auto-quest-ui-check / --auto-task-tracker-route-check / --auto-quest-objective-templates-check")
	lines.append("自动战斗: --auto-battle-settings-check / --auto-battle-auto-10v10-check")
	lines.append("捉宠: --auto-capture-settings-check / --auto-pet-capture-feedback-check")
	lines.append("人物/骑宠: --auto-player-status-check / --auto-player-rebirth-preview-check / --auto-player-rebirth-execute-check / --auto-player-rebirth-chain-check / --auto-remote-stable-unlock-check / --auto-riding-system-check")
	lines.append("地图经济: --auto-map-region-contract-check / --auto-reward-grant-check / --auto-reward-mail-fallback-check")
	lines.append("数值: --auto-balance-catalog-check / --auto-pet-growth-threshold-check / --auto-pet-growth-observation-check / --auto-pet-rebirth-mm-formula-check / --auto-pet-growth-species-simulation-check / --auto-pet-growth-starter-profiles-check / --auto-balance-version-receipt-check / --auto-balance-snapshot-digest-check / --auto-combat-formula-parity-check / --auto-combat-v2-shadow-check / --auto-combat-formula-driver-ab-check / --auto-numeric-experiment-report-check / --auto-numeric-workbench-check / --numeric-experiment-report")
	lines.append("GM地图: --auto-gm-10v10-map-check / --auto-facility-marker-check / --auto-facility-dialog-options-check / --auto-npc-quest-marker-check / --auto-stable-facility-check / --auto-qa-panel-check / --auto-panel-registry-check")
	lines.append("完整清单: docs/bak/legacy_phase_notes/phase_92_gm_qa_panel.md")
	return "\n".join(lines)
