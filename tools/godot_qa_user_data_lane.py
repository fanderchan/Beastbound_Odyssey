#!/usr/bin/env python3
"""Prepare and clean fixed Godot QA user-data lanes without touching player data.

The lane roots are derived from a closed lane catalog.  Callers cannot provide
an arbitrary filesystem path, and cleanup never follows symbolic links.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import ntpath
import os
import posixpath
import re
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping


OWNER_CANARY_NAME = ".beastbound_qa_lane_owner.json"
LOCK_CANARY_PREFIX = ".beastbound_qa_lane_lock_"
EDITOR_CUSTOM_FEATURES_ENV = "GODOT_EDITOR_CUSTOM_FEATURES"
REAL_PROJECT_DIR_NAME = "Beastbound Odyssey - 万兽纪元"
RECOVERY_NO_PROCESS_CONFIRMATION = "I_CONFIRMED_NO_GODOT_OR_QA_PROCESSES"
FEATURE_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")
POSIX_DIR_FD_FUNCTIONS = (
    ("open", os.open),
    ("stat", os.stat),
    ("mkdir", os.mkdir),
    ("unlink", os.unlink),
    ("rmdir", os.rmdir),
    ("link", os.link),
)
POSIX_NOFOLLOW_FUNCTIONS = (("stat", os.stat), ("link", os.link))

LANES = {
    "automation": {
        "feature": "beastbound_qa_automation",
        "customUserDirName": "BeastboundOdysseyQA_Automation",
    },
    "client1": {
        "feature": "beastbound_qa_client1",
        "customUserDirName": "BeastboundOdysseyQA_Client1",
    },
    "client2": {
        "feature": "beastbound_qa_client2",
        "customUserDirName": "BeastboundOdysseyQA_Client2",
    },
}
RESERVED_FEATURES = frozenset(record["feature"] for record in LANES.values())
RUNNER_SOURCE_SHA256 = "88af3f9c2e66820bb4a51ab8311a113c2a7fd410055dad7e9fd27881bb5181bc"
HELPER_CONTRACT_FUNCTION_SHA256 = {
    "_absent_inventory": "98f816ee9fc7b7c8eb2f1b8506a805995ad5972c8e06888a05e6f2e845e9940c",
    "_assert_no_symlink_components": "eab6e07e0cee299d46589930d37318184b88b83bd7080d02d24429d89c29b993",
    "_canonical_current_paths": "4f92151a7eaa11a85118f9ce9c984b5652a08794c0fd32ae28c3f9ada3b2b6bd",
    "_current_environment_anchor": "217f314af66649439acbfa29fee134c4b49cfd25af16359411b232eb008ff9ce",
    "_directory_has_identity": "a31584102b25cef6575688c910c5b67d484466a58ca1e233a95dc2fa6aa1a549",
    "_directory_open_flags": "2a1e5670e00901c88b6f694f476ce2d869c17a38ad43d1148d9f6df6988653c4",
    "_file_open_flags": "280c476e9bd59bcbda64020ad6f12abe1b8dceeaa9ee2a64d860fc7f76f195a5",
    "_file_sha256_no_follow": "78e7bb6fdc1febf9f534120ece23c2359872452f7ca041c71c3922e23f8de417",
    "_inspection_sha256": "fd277277036380e925602de35db4fb9b3c35e626060a99aebb97949f674466d9",
    "_inventory_result": "fa95be46965ac2f0ed995407b5d778c1055b250f18910a0c8bbd4e9a3be0cc1b",
    "_inventory_tree_path": "6c15b818010b2d82a8a50710bed92f8f0b53296d358f0e7bb7667f9eef2a7a8f",
    "_inventory_tree_posix": "37f87a342324027f437c1085885df63cf8acd14407a025a4dd59079485b19063",
    "_is_link_or_reparse": "dd2dea917aea468968402549b20199df56bd65491638bca41b7ca2ead6a97850",
    "_lane_record": "aca5ef5924c17be49a4e71888912626c261e0f9b8dd6ad70be979ffe2aa5623e",
    "_lock_name": "e47d67aca0a5eb5e41e99bca6d0088b67bd7a020f2c6aaea353d55d4eb6e262f",
    "_lock_payload": "ea6182f1ddb7c2219a4bc3ef9e84a82239328bd9e3007efbe3edf4529a9182fb",
    "_lock_real_inventory_sha256": "371b17e5b3b7069912943965d058cd31289d7edf03a919a1298049af29eb438a",
    "_lock_temp_name": "dc56fbf7674d243c18488a4201230068b9a8aa6fb41b2720812560ce10a55603",
    "_open_current_data_base": "ed9a62e3ac9a0ba10a8c2737c14858923cbedab313f1bc1326f527b827de4c6f",
    "_open_descendant_directory": "ee6cb497f8cc5b55db32c34393afda189b964968f44cf8edfbbaca07e345a4d4",
    "_open_directory_no_follow": "3b954c1b3f0a6b88c8fd518509cc4972a9f10185d9183b3217f52a750429dadf",
    "_owner_payload": "875f2794a4dcacd0a061dcc397082c43387815917086a55f0a89f073cc3a944e",
    "_owner_record": "b0f124853af3f1bc205dc6461d4988fcad8bcc08ae4caaae5620714f9e880884",
    "_owner_temp_name": "b4b528379437ac630c0679d28dbda342ea6c0079f64f64423881fd4e79d064d2",
    "_parser": "ac418c8a59b4c6c88644ccccc7856819a680d810ecf62c8e6a87300757b098a2",
    "_path_is_link_or_reparse": "47004ec24a0be5a18dc2210c2278956339e1287bd3e93dc049263ac156b43d29",
    "_project_contract_lines": "e28b8415d96f92622190f191a1df88e2935ffa103d354cccbffe4fbdaf1ebaa1",
    "_publish_regular_file_exclusive": "c5c953814f1ada57804f6edc2269b718d829e6cff6b3cfa599b838011aa60ec8",
    "_raw_named_function_sources": "4da0c1a4a1a8d920ef25beb0a7ddc80f02ee73d228bb121975eb93c0d88b0709",
    "_read_bounded_regular_payload": "af2d81c9a8eab7a129cc38c7c68a040f45af3ccfe4272a52d3679e83484dda3f",
    "_read_descriptor_payload": "b695f798b7d44f0078ab9f1b391ad4c647a35b52ed56cd5e344b0b791da76089",
    "_read_lock": "ec76f3c81ec8d96e2e8c8de175073df5e1d5130dc0c7b18cac091d4e401512e5",
    "_read_owner": "463d679b926714f7c0ca0d9ecdc7b4969e4b2da4be6f3c892ddf7197455a06d9",
    "_read_owner_payload": "5542e8984a62dcfefa5fa80e08127fc28963e561aa52632149c4d149ef8dfeb6",
    "_read_published_authority_payload": "f124bb9ec8a5732753289b53dbbb7f202af55c65897027645bd80e9c74f9c29a",
    "_read_recoverable_lock": "3b2c40a2f8dbb51b0d8b104282f5c580d1daa38cf29f48305d96ddf2c9ad1c0f",
    "_relative_directory_components": "7c2e692675eac16d5741f5dcca4e1356fa418db7833bcec3bc968cf94f2711c3",
    "_remove_created_regular_file": "4a8ef76edf9fa12807d752b0d9b7559e5fbd475249604aff197a4fc73faf8393",
    "_remove_directory_contents_posix": "4b9d3b8c243668c2631cb9ba20b81e42e794b6759663bcf37d610d91c5f9f9f3",
    "_remove_empty_directory_posix": "f0270eb6b2c2d0c944fd7bc735da5984721d81c39417bacd6fd4126fbc7dacad",
    "_remove_incomplete_lane_for_recovery": "20b5700ebd402877dd006463040b41dbd2548821a459b7d87815a9c22e8a956c",
    "_remove_lock_exact": "e7fee7194a6442c778962d6624039613c0d96d60637eb81a39b2d88f12a12462",
    "_remove_owner_canary_exact": "27910efa5b1bfb7a99017b0a024cb7847454f18e0d89f956d38158dbe261839b",
    "_remove_pending_lock": "9a7b5eb38cbfe041e996339715ea1a4a3ae6d39e79132c4e2f0982ddd661de65",
    "_remove_pending_owner": "29eb734d1e68d6211cc58f568234dce51779f0d638fc009ad44707ec7c19ea0b",
    "_remove_regular_file_posix": "28a9ccbac755093e0494c541b3d1a701094329d1288cc6e37d1c1f9ca58b7442",
    "_remove_tree_no_follow": "6f4ff29f0e151677bdbf8a0f841b47efba950f8cf9b4b53b48ce9f572a68dcb6",
    "_remove_tree_path": "15a6c2dddca9db228220a71fc7f62e137fdb1eb108f6a7724a5424ed7ddf0ecc",
    "_remove_tree_posix": "c7b7e46ad94b20e5d89bbe412e88f5da8254206959acdc1fb856404b0bb379f0",
    "_require_posix_lane_lifecycle": "cc0ab50ed260224334dfb83ad683f84f91da06d5c3a290b5c2a2e44050090c76",
    "_same_identity": "eb2baf327e1f2c18d9a49057b05a1bca53ff7b484dc5716751d4fe11105bee96",
    "_sha256_from_descriptor": "2ad426766dd214d2c1e55cac6d1cfe31872c3df7673ef7296fd7c6e21c368b40",
    "_stable_stat_tuple": "3945f10854ad36d3ff0918caa6fcc3a3ad01553934838afe54ccd451b1310110",
    "_top_level_assignment_sources": "f5c7b66dfefb5f6553a33e599e54e631ef99306ee31fc90f7c2340d080d17ad2",
    "_validate_helper_constant_contract": "e45a17ab843bcc82812426b2d76dbb80f99ddb8c689fb2fb92c9636994b0cb33",
    "_validate_helper_function_contract": "103ba59e94d733d49e86c5774d76a39589fc6c5e86b0727763833595906c7f08",
    "_validate_named_function_contract": "babc90c421bc13a6716f008593999d7c444a3abb926c439d415e78a34647fcf5",
    "_validated_owner_token": "a8af7ed3f13ade53c4a5113b01cfd336040787c2f2fcfb703dda502a5eab5690",
    "_write_all": "c981c7438b750d851532cc93114757449cc6fd2877e40a783b8878dd8786baa6",
    "_write_lock_exclusive": "d8363a4e5a385a670b9771babca9ce57d0e0eafe37d6e6ee29c8c7cb6806f6ca",
    "_write_owner_exclusive": "0db65d41eeb00551abf16181ee85c7ec63050e54988e2221010b260b9136721a",
    "cleanup_lane": "2f25a50ae08030838144a5df7a09aec37535e6b07e60ef4c5e01b41e3373cd3d",
    "inspect_lane": "3adbc6452996ca0fb8441fe77924777306e17e0fb90c401cc7f8c108f1a5b16b",
    "inventory_tree": "6c38a340de5849a7fc30dcb0c3781052d9015529500f3681d45b5f40796d36ef",
    "main": "22ca52aa4d6f292b67bc5d150c52b8f625f7fdb5b26125a5eadd8ed01184d52c",
    "merge_editor_custom_features": "34704d0f3188304cdfa432ae2f71c397e685901d8a11b2ec15ddb54b03293275",
    "platform_lane_paths": "dcb80ffe85bef75fca88d21ca80c196c1bce2e93b78ceef0683676464ee766ce",
    "prepare_lane": "72ab5ded5432c49d2e850d274009fdb4997698e7a91352b6b1377ab5e79baa01",
    "recover_lane": "56fd5945432331f12fadc25eb9607391bb282ce9df323cec66d1d004a82de364",
    "validate_repository_contract": "4ba4866c16485a47b930ab8ebb485c6106482da13f7705d10ed56f9737b4c746",
    "validate_repository_sources": "bcb50ec0dcbd298e4ec275d701558cc6e91ce7770c403909b545715e5b8fcee3",
    "verify_lane": "daed73b13c70c4557a058a55440e10f2d7ea0c770efa8b8dec88cfdfb2e94313",
}
MAIN_CONTRACT_FUNCTION_SHA256: dict[str, str] = {
    "_active_qa_user_data_features": "23cdb408058f7ebf5beccded22945a94550383ac5d81205fd493d02f1e240db0",
    "_apply_preview_window_args": "24e6a4105a658f6fcd00179b518ad1a64770a9453cdef4814875693940685168",
    "_attest_qa_user_data_lane_or_exit": "dcdf0ddd8c924d31ffe6bed3cf059ff2ac8db3901205e0bf670c684ac27c36a3",
    "_dev_entrypoint_arg": "3f5ec8368066ea72fb45c95ad37292c502c0be9f22d25c7f226ea1d650eb2487",
    "_qa_user_data_root_text": "9a799a68912d57a63d1be1042f2c58597b3d224cdcf16e26cae9997afca49e96",
    "_ready": "e542651ad1fbd5e33d00d6e91195302eac8b3ba6eed09387ca5a947852b4aa41",
    "_reject_qa_user_data_lane": "5da773db2c7cf1247d56d0d56f65eb85ce48cd1932c1d49972c57a728691097c",
    "_run_auto_pet_action_asset_check": "562195a21e5c6efcb8c151f337fe4507c28a4bf06a50e9901018a16aba7a9baf",
    "_run_battle_layout_owner_review_capture": "b45f43e99209a276d65fe10a7d0f9ee7a3c3e3ee6258df7dec9a6cae948a14e5",
    "_run_pet_codex_awakened_owner_review_capture": "e05b4ab2d7883ed4faadeb3c1819ed8110e108fd1a0f68cd40e36235064bd98c",
    "_run_pet_battle_user_root_preflight_if_requested": "e7ac7083c818f1951bd46f6aca53aa965c478b2b7f7669ce68d9e786cbb2ee54",
    "_startup_auth_cli_arg": "3ebf0b9dfa27d82e4a36befd3ebac61780bbd0789527268f26eb299affe9e4db",
}
RUNNER_CONTRACT_FUNCTION_SHA256: dict[str, str] = {
    "assertExactPayloadKeys": "09bc031424700a61859ece06cfa7ed90c3d30652673f248ed29ac100edfb907e",
    "assertExistingPathComponentsAreDirectoriesWithoutLinks": "bbbfc9ced2c9f6e04e3949b178727ab90022b9fa84c97843fb0c674982202b6c",
    "assertHex": "1f16100a68b90136f3959cbfc409ba244f2d9f3cdddecf76c7acb3ba4e86f10a",
    "assertJsonKeysUnique": "09e1fb033f7f07e74e14eb36148a8906e3597136b68847c40afe7370b4f340b9",
    "assertNonNegativeInteger": "fdd180e35b960b1a7ae62a8766eda10f85b5da7bd925db1fe92626c5eb173e8e",
    "assertPreflightProbeContained": "18017ffeba49cb20f998d0f30aedc2c3af6d387cbebd92e75c86230ca53ab302",
    "autoCheckCompletionContract": "3ea236319b6d85c1332737c1c37722afb93a9bf9e7e09d2d7226a700940ac17d",
    "buildCheck": "532e6de122e82e6404e9f8251597034aa818e7f5fc10418f9850b825de193a1d",
    "buildGodotLaneEnvironment": "78b2a1f70a897f79ad94c4753ff0ab68092b13b95465e5163a9fd10d98169a60",
    "buildQaLaneSummary": "817e63b40bc17d4548a009691f3aec95bea28af008dbddbdfe71c7dc059ecbdb",
    "buildRunSummary": "096cacb8771f6a5d635e03bba44460239e6c8f419c262b4323290b5d2edae191",
    "cleanupQaLane": "8ca126d697ca11068f7a616133b8b682d7487d8620ccc6235f413094faa0cdd5",
    "createLanePreservationError": "e828861b7c3adaa6b28de1c5ee6f05bef127b4222b8b02ab52d1085df0f69d12",
    "createSynchronousLog": "73f8220208cf1338120e58cba66e2e53101e5401729c3b3359335977c06d4fe0",
    "delay": "fd2819c0b1e87b0f85e9771947bc515d08680a22a086b04b0fcef334c9f49326",
    "descendantProcessIds": "b985a7931e3ba557084651fbc2e91f5701f7ee9cb8f70bddc78712cae66235f9",
    "discoverAutoCheckFlags": "ce8b635245847d953ba649a8248356c3fc8a8e63664885c26414059d0feaa67d",
    "ensureProcessGroupClosed": "5a14bf975fdb116fdf4c47077e796fedd58b5a7deacb6aaf807564fe30e8deb3",
    "ensureStartupLoginAccount": "9c74a165e4a9f0f9d7e37ef30a8ef48feecded9bb9a6ff2aabe3a7f560caaa45",
    "escapeRegExp": "d0180bd9422ef0810aeff440514f155fd11635028932741137e77c72c13c9d15",
    "expectedAutoCompletionPrefix": "d777f3e4ef6a5c36042705863899a4e3c2e1bcd8e8244903c0d533983a512d5c",
    "extraUserArgsForFlag": "3414fab1976efee1bd133104ef82f845dad377200a7b86e56a1601de3c3b363a",
    "filterFlags": "28b40e628af13b5ed8b2a6eef90dcc807f43743a6f46ec895b31b3c3ae3c23e7",
    "gitSha": "861c108d6f3f4397c7c64e22f1abaf2e683226c31cf3e15439d0918f8ee63f01",
    "godotCompileFailureDiagnostic": "de178f0cc40083f231119721f183b36b9b3c15fc50a57f58be33efcaf6b12cad",
    "godotHelpHasOption": "bbb81b32286181c0962f9f29f3eea2199bd336e79f7ccb9f6557b8afccc64f79",
    "inferQuitAfter": "d9aaa6ce8f5e685714ad27246a39f5ae0a1b31f781bad62ca589199df3c62c71",
    "isEqualOrDescendantPath": "192525d84f93ce40f74eac7e5f4b8307006ec3cef16fd861601fa680334b693c",
    "main": "653ebd67bc85364ee0a4a7d879ad42f71e6e30a8590bf1704d086a7330d41cc4",
    "makeResult": "23e7154257138f853c39ad56d3823ca44606091111fbcc17adef2fbe4eba66f4",
    "markLaneVerificationFailure": "1e8eb47178c1e2afba24cb46f9a091b0dff07a7543b58f91c4f3985dce4d4d5f",
    "markProcessGroupResidual": "bc2022a77fca3fcac9f8ee6d022efa9f73a31fe5bed858cb742ad218cef6a1f9",
    "normalizeGodotPath": "7817cb84d5d4345b130d21868172d79ba00bf0a1f05c17cc005388837c15744c",
    "nowStamp": "a1c7bc5c8023b2420b9611adb71d47ccaec657dd155ea53ec2d8a814413af5a2",
    "parseArgs": "6d0f9e748a1983f0b3dbed126c03bdd3a249661ec2dad0ffda6ee0c9bc1c6cec",
    "parseAutoCheckCompletion": "90fb73d0b93485979a73fcf037dbc7af03f2d6ef48e661b23f00fde9a7e8ea70",
    "parseLaneHelperOutput": "5db916aadd2932fd4883b825151906e07bb1a2b4658af0f231ba88b169a860a3",
    "parseQaLaneAttestation": "99dc1d415ca2532d1192c6cf80bc68012dffae7ec68f19217c3456555bf54952",
    "parseTextAutoCompletionFields": "997b2a83c656d0ff9d27fa04e8eeb3648c6f3faa4d7de270f735baf229d82649",
    "pathsIntersect": "d810dba0ae7320b0e1e96a65f8df0e2c2b505344a9ae9572fee3454cea2fa286",
    "postAuthJson": "53fb4e56010ee2a0b87c3238f6739fc5d86ce0b8900f7d41b7c63237753b70ff",
    "preflightGodotEditorBinary": "d0e4d1c65c9fe00157fa1d9a6c0d6b9b62930c7080cae6cfa5ffc1e262591a50",
    "prepareCheck": "b632d0dd5a6b6c7611f17c43af5a1406ca1f8549b6ed6ea630290df476f3985f",
    "prepareQaLane": "6a6e2f2ac62e979677e8be0ce613624c508d9a47db5ebcaed94452654c0b3307",
    "printSummary": "b5f37321b527170f2776a6aff8aee3ab85d851c9c532c446a321e32fe8901e2e",
    "processGroupClosureEvidence": "7860602778ab11380a3c05f2495b7b158c558426994c04f168a797f85b0312de",
    "processGroupExists": "ff091e9919f5e0eb377d7c499f6130192dd11f63d0b9b3148d5d71061013dd81",
    "requestGracefulShutdown": "9263a976917340655dbd39a2dbc28c148266eda3c4fa385cfaa61e7ad513da91",
    "runCheck": "638b36c8c339e97de2cb3b76ddb39b42555ef119393875ce02b981ce51902ff8",
    "runGodotPreflightProbe": "0fa2e620c20c397f918f3fe44344ea167686d03d02d2893fc6507368be0f1e96",
    "runQaLaneHelper": "af773cd1567d9bf3b2e5645d79d649b5f3030f3069b92ceab1b62a04bc072fae",
    "safeErrorText": "6e5a1d39323a326cb4e63e80d919cffc99dc8e872829703aedc10685394e90e9",
    "safeThrowableProperty": "04f999fc1cede400974b934f1b12038dc5ffe089ac063a6625c397fc7e443c63",
    "splitFlags": "d7ee69b8ef6027cb94f288bd3da2bc07ead869a111b4ba8578f95024bcd1e0a8",
    "terminateProcessGroup": "2dc336ea9b5c6975ef5e9b31763f83ea0fad990b6429d3e9e7eec07782afee4a",
    "terminateWindowsProcessIds": "9485dd3d699bbaf3a915fd44027fab4d616889afa4062b94128969a172f015bc",
    "usage": "8e4183877b1ab3221a6ab734fd883b2b0402d4070a25e3df96db39a30d162668",
    "validateCleanedLanePayload": "96beef139205206e7f14ecfcfd385cfb9028498a502f2d62fe7f50123e285575",
    "validatePreparedLanePayload": "6b1c8bb83374054623376c65be5e105f47bbaf618206c0c46e26728bf48a0fae",
    "validateQaOutputDirectory": "304cc9eed032830fe046dcb9a311cef80f990847f20521140ddccb2f64d25c23",
    "validateQaLaneSourceContract": "163ae880521cb98388310ab80080edfe5b3f7fdc1ab721ee12a6d7315f8b08cb",
    "validateRecoveredLanePayload": "20131525612302611ed85ed412d09665825eb8e401640d24243123d4872ce6c6",
    "validateVerifiedLanePayload": "3735fdb3d062a324859c37d6b20ea44cd2def05c48f8785c223ab5c62851d9ba",
    "verifyQaLane": "3a4e57f849f2603097c0e1a853df3a9a3aa535e0cb676f79a539c1180e23083c",
    "verifyQaLaneOrPreserve": "21ed3851423033b5fd61c037af5b331ce6a925a73b992a1fbd54712428300f2b",
    "windowsProcessRecords": "00144c0768c14997a27fe9d9af19c2d2da2cebe04ea745d813e26ac6e07577b8",
    "writeExclusiveFile": "a27ff59d7e561b2be29b74d71cd90b628f9c8d750f9c21083cbe175881c439bc",
    "writeLogOrThrow": "6ead09d2c3b33e65d7976a7b1ae4bb1dfc959c2b691c6edd784d047eab55228c",
    "writeProcessEvidence": "b488820c61eb90ff4e6edd57ceb339bd8b97a35e4ba64314898fa333d7afc0f9",
}
AUTO_CHECK_CONTRACT_FUNCTION_SHA256: dict[str, str] = {
    "_run_auto_auth_check": "694ee50df8437c9d22bcbcd99a5a834940417a483d10c5f07ec305273a68dcdd",
}
class LaneSafetyError(RuntimeError):
    """Raised when a lane cannot be proven safe to inspect or remove."""


@dataclass(frozen=True)
class LanePaths:
    lane: str
    feature: str
    custom_user_dir_name: str
    data_base: str
    lane_root: str
    real_root: str

    @property
    def godot_lane_root(self) -> str:
        return self.lane_root.replace("\\", "/").rstrip("/")

    @property
    def godot_real_root(self) -> str:
        return self.real_root.replace("\\", "/").rstrip("/")


def _lane_record(lane: str) -> dict[str, str]:
    exact = str(lane)
    if exact not in LANES:
        raise LaneSafetyError(f"unknown QA user-data lane: {exact or '<empty>'}")
    return LANES[exact]


def _is_link_or_reparse(file_stat: os.stat_result) -> bool:
    return (
        stat.S_ISLNK(file_stat.st_mode)
        or bool(getattr(file_stat, "st_file_attributes", 0) & 0x400)
        or bool(getattr(file_stat, "st_reparse_tag", 0))
    )


def _path_is_link_or_reparse(path: Path) -> bool:
    try:
        return _is_link_or_reparse(path.lstat())
    except FileNotFoundError:
        return False


def platform_lane_paths(
    lane: str,
    *,
    platform_name: str | None = None,
    environment: Mapping[str, str] | None = None,
) -> LanePaths:
    """Return Godot's fixed real and custom user-data roots for an OS vector."""

    record = _lane_record(lane)
    platform_value = str(platform_name or sys.platform).lower()
    env = dict(os.environ if environment is None else environment)
    if platform_value.startswith("win"):
        appdata = str(env.get("APPDATA", "")).strip()
        if not appdata or not ntpath.isabs(appdata):
            raise LaneSafetyError("an absolute APPDATA is required for the Windows Godot data root")
        data_base = ntpath.normpath(appdata)
        join = ntpath.join
        godot_folder = "Godot"
    elif platform_value == "darwin":
        home = str(env.get("HOME", "")).strip()
        if not home or not posixpath.isabs(home):
            raise LaneSafetyError("an absolute HOME is required for the macOS Godot data root")
        data_base = posixpath.normpath(posixpath.join(home, "Library", "Application Support"))
        join = posixpath.join
        godot_folder = "Godot"
    else:
        xdg_data_home = str(env.get("XDG_DATA_HOME", "")).strip()
        if xdg_data_home and posixpath.isabs(xdg_data_home):
            data_base = posixpath.normpath(xdg_data_home)
        else:
            home = str(env.get("HOME", "")).strip()
            if not home or not posixpath.isabs(home):
                raise LaneSafetyError("an absolute HOME or XDG_DATA_HOME is required for the Linux Godot data root")
            data_base = posixpath.normpath(posixpath.join(home, ".local", "share"))
        join = posixpath.join
        godot_folder = "godot"
    return LanePaths(
        lane=lane,
        feature=record["feature"],
        custom_user_dir_name=record["customUserDirName"],
        data_base=data_base,
        lane_root=join(data_base, record["customUserDirName"]),
        real_root=join(data_base, godot_folder, "app_userdata", REAL_PROJECT_DIR_NAME),
    )


def merge_editor_custom_features(existing: str, target_feature: str) -> str:
    """Preserve valid existing feature tags and append one reserved target."""

    if target_feature not in RESERVED_FEATURES:
        raise LaneSafetyError(f"unknown Beastbound QA feature: {target_feature}")
    parsed: list[str] = []
    seen: set[str] = set()
    for raw_token in str(existing or "").split(","):
        token = raw_token.strip()
        if not token:
            continue
        if not FEATURE_TOKEN_PATTERN.fullmatch(token):
            raise LaneSafetyError(f"invalid editor custom feature token: {token!r}")
        if token in RESERVED_FEATURES and token != target_feature:
            raise LaneSafetyError(f"conflicting Beastbound QA feature already present: {token}")
        if token == target_feature or token in seen:
            continue
        seen.add(token)
        parsed.append(token)
    parsed.append(target_feature)
    return ",".join(parsed)


def _current_environment_anchor() -> Path:
    platform_value = sys.platform.lower()
    if platform_value.startswith("win"):
        raw = os.environ.get("APPDATA", "")
    elif platform_value == "darwin":
        raw = os.environ.get("HOME", "")
    else:
        xdg = os.environ.get("XDG_DATA_HOME", "")
        raw = xdg if xdg and os.path.isabs(xdg) else os.environ.get("HOME", "")
    return Path(os.path.abspath(os.path.normpath(raw)))


def _assert_no_symlink_components(path: Path, anchor: Path) -> None:
    if anchor != path and anchor not in path.parents:
        raise LaneSafetyError("Godot data base escaped its environment anchor")
    components: list[Path] = []
    current = path
    while True:
        components.append(current)
        if current == anchor:
            break
        current = current.parent
    for component in reversed(components):
        if component.exists() or _path_is_link_or_reparse(component):
            if _path_is_link_or_reparse(component):
                raise LaneSafetyError(f"filesystem ancestor must not be a symbolic link: {component}")


def _canonical_current_paths(lane: str) -> tuple[LanePaths, Path, Path, Path]:
    paths = platform_lane_paths(lane)
    data_base = Path(os.path.abspath(os.path.normpath(paths.data_base)))
    lane_root = Path(os.path.abspath(os.path.normpath(paths.lane_root)))
    real_root = Path(os.path.abspath(os.path.normpath(paths.real_root)))
    if lane_root == data_base or lane_root.parent != data_base:
        raise LaneSafetyError("QA lane root must be one fixed direct child of the Godot data base")
    if lane_root in data_base.parents or real_root == lane_root or lane_root in real_root.parents or real_root in lane_root.parents:
        raise LaneSafetyError("QA lane root resolves to an ancestor or broad path")
    if not data_base.is_dir():
        raise LaneSafetyError(f"Godot data base does not exist as a directory: {data_base}")
    _assert_no_symlink_components(data_base, _current_environment_anchor())
    _assert_no_symlink_components(lane_root, data_base)
    _assert_no_symlink_components(real_root, data_base)
    return paths, data_base, lane_root, real_root


def _directory_open_flags() -> int:
    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    return flags


def _file_open_flags() -> int:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    return flags


def _same_identity(left: os.stat_result, right: os.stat_result) -> bool:
    return (left.st_dev, left.st_ino) == (right.st_dev, right.st_ino)


def _stable_stat_tuple(value: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        getattr(value, "st_ctime_ns", int(value.st_ctime * 1_000_000_000)),
    )


def _open_directory_no_follow(path: str | Path, *, dir_fd: int | None = None) -> tuple[int, os.stat_result]:
    before = os.stat(path, dir_fd=dir_fd, follow_symlinks=False)
    if _is_link_or_reparse(before) or not stat.S_ISDIR(before.st_mode):
        raise LaneSafetyError(f"expected non-link directory: {path}")
    descriptor = os.open(path, _directory_open_flags(), dir_fd=dir_fd)
    opened = os.fstat(descriptor)
    if not stat.S_ISDIR(opened.st_mode) or not _same_identity(before, opened):
        os.close(descriptor)
        raise LaneSafetyError(f"directory changed identity during open: {path}")
    return descriptor, before


def _relative_directory_components(path: Path, authority_root: Path) -> tuple[str, ...]:
    normalized_path = Path(os.path.abspath(os.path.normpath(path)))
    normalized_authority = Path(os.path.abspath(os.path.normpath(authority_root)))
    try:
        relative = normalized_path.relative_to(normalized_authority)
    except ValueError as error:
        raise LaneSafetyError(f"path escaped its directory authority: {normalized_path}") from error
    components = tuple(relative.parts)
    if any(component in ("", ".", "..") or os.sep in component for component in components):
        raise LaneSafetyError(f"unsafe relative directory component under authority: {normalized_path}")
    return components


def _open_descendant_directory(
    authority_fd: int,
    authority_root: Path,
    path: Path,
) -> tuple[int, os.stat_result]:
    current_fd = os.dup(authority_fd)
    try:
        current_stat = os.fstat(current_fd)
        if not stat.S_ISDIR(current_stat.st_mode):
            raise LaneSafetyError("directory authority is not a directory")
        for component in _relative_directory_components(path, authority_root):
            child_fd, child_stat = _open_directory_no_follow(component, dir_fd=current_fd)
            os.close(current_fd)
            current_fd = child_fd
            current_stat = child_stat
        return current_fd, current_stat
    except BaseException:
        os.close(current_fd)
        raise


def _open_current_data_base(data_base: Path) -> tuple[int, os.stat_result]:
    environment_anchor = _current_environment_anchor()
    anchor_fd, _anchor_stat = _open_directory_no_follow(environment_anchor)
    try:
        return _open_descendant_directory(anchor_fd, environment_anchor, data_base)
    finally:
        os.close(anchor_fd)


def _sha256_from_descriptor(descriptor: int) -> str:
    digest = hashlib.sha256()
    while True:
        chunk = os.read(descriptor, 1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
    return digest.hexdigest()


def _file_sha256_no_follow(path: Path) -> str:
    before = path.lstat()
    if _is_link_or_reparse(before) or not stat.S_ISREG(before.st_mode):
        raise LaneSafetyError(f"expected regular file: {path}")
    descriptor = os.open(path, _file_open_flags())
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode):
            raise LaneSafetyError(f"file changed type during inventory: {path}")
        if not _same_identity(before, opened):
            raise LaneSafetyError(f"file changed identity during inventory: {path}")
        digest = _sha256_from_descriptor(descriptor)
        after = path.lstat()
        if _is_link_or_reparse(after) or _stable_stat_tuple(before) != _stable_stat_tuple(after):
            raise LaneSafetyError(f"file changed during inventory: {path}")
        return digest
    finally:
        os.close(descriptor)


def _absent_inventory() -> dict[str, object]:
    return {
        "exists": False,
        "entryCount": 0,
        "sha256": hashlib.sha256(b"absent\n").hexdigest(),
        "entries": [],
    }


def _inventory_result(entries: list[dict[str, object]]) -> dict[str, object]:
    canonical = "".join(
        json.dumps(entry, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
        for entry in entries
    ).encode("utf-8")
    return {
        "exists": True,
        "entryCount": len(entries),
        "sha256": hashlib.sha256(canonical).hexdigest(),
        "entries": entries,
    }


def _inventory_tree_posix(
    root: Path,
    authority_root: Path,
    authority_fd: int,
    *,
    reject_symlinks: bool,
    reject_executables: bool,
) -> dict[str, object]:
    try:
        root_fd, root_stat = _open_descendant_directory(authority_fd, authority_root, root)
    except FileNotFoundError:
        return _absent_inventory()
    entries: list[dict[str, object]] = [{
        "path": ".",
        "kind": "directory",
        "mode": stat.S_IMODE(root_stat.st_mode),
        "mtimeNs": root_stat.st_mtime_ns,
    }]

    def visit(directory_fd: int, relative_parent: str) -> None:
        with os.scandir(directory_fd) as iterator:
            names = sorted(entry.name for entry in iterator)
        for name in names:
            relative = f"{relative_parent}/{name}" if relative_parent else name
            item_stat = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            mode = stat.S_IMODE(item_stat.st_mode)
            if _is_link_or_reparse(item_stat):
                if reject_symlinks:
                    raise LaneSafetyError(f"symbolic link or reparse point is forbidden in QA lane: {relative}")
                entries.append({
                    "path": relative,
                    "kind": "symlink",
                    "mode": mode,
                    "mtimeNs": item_stat.st_mtime_ns,
                    "target": os.readlink(name, dir_fd=directory_fd),
                })
                continue
            if stat.S_ISDIR(item_stat.st_mode):
                child_fd, opened_child_stat = _open_directory_no_follow(name, dir_fd=directory_fd)
                try:
                    if not _same_identity(item_stat, opened_child_stat):
                        raise LaneSafetyError(f"directory changed identity during inventory: {relative}")
                    entries.append({
                        "path": relative,
                        "kind": "directory",
                        "mode": mode,
                        "mtimeNs": item_stat.st_mtime_ns,
                    })
                    visit(child_fd, relative)
                    after_stat = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
                    if _stable_stat_tuple(item_stat) != _stable_stat_tuple(after_stat):
                        raise LaneSafetyError(f"directory changed during inventory: {relative}")
                finally:
                    os.close(child_fd)
                continue
            if stat.S_ISREG(item_stat.st_mode):
                if reject_executables and mode & 0o111:
                    raise LaneSafetyError(f"executable residual is forbidden in QA lane: {relative}")
                file_fd = os.open(name, _file_open_flags(), dir_fd=directory_fd)
                try:
                    opened_file_stat = os.fstat(file_fd)
                    if not stat.S_ISREG(opened_file_stat.st_mode) or not _same_identity(item_stat, opened_file_stat):
                        raise LaneSafetyError(f"file changed identity during inventory: {relative}")
                    file_sha256 = _sha256_from_descriptor(file_fd)
                    after_stat = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
                    if _stable_stat_tuple(item_stat) != _stable_stat_tuple(after_stat):
                        raise LaneSafetyError(f"file changed during inventory: {relative}")
                finally:
                    os.close(file_fd)
                entries.append({
                    "path": relative,
                    "kind": "file",
                    "mode": mode,
                    "size": item_stat.st_size,
                    "mtimeNs": item_stat.st_mtime_ns,
                    "sha256": file_sha256,
                })
                continue
            raise LaneSafetyError(f"special filesystem entry is forbidden: {relative}")
    try:
        visit(root_fd, "")
        after_root_stat = os.fstat(root_fd)
        if _stable_stat_tuple(root_stat) != _stable_stat_tuple(after_root_stat):
            raise LaneSafetyError(f"inventory root changed during inventory: {root}")
    finally:
        os.close(root_fd)
    return _inventory_result(entries)


def _inventory_tree_path(
    root: Path,
    root_stat: os.stat_result,
    *,
    reject_symlinks: bool,
    reject_executables: bool,
) -> dict[str, object]:
    entries: list[dict[str, object]] = [{
        "path": ".",
        "kind": "directory",
        "mode": stat.S_IMODE(root_stat.st_mode),
        "mtimeNs": root_stat.st_mtime_ns,
    }]

    def visit(directory: Path, relative_parent: str, expected_stat: os.stat_result) -> None:
        directory_stat = directory.lstat()
        if (
            _is_link_or_reparse(directory_stat)
            or not stat.S_ISDIR(directory_stat.st_mode)
            or not _same_identity(expected_stat, directory_stat)
        ):
            raise LaneSafetyError(f"directory changed identity during inventory: {relative_parent or '.'}")
        with os.scandir(directory) as iterator:
            children = sorted(iterator, key=lambda entry: entry.name)
        for entry in children:
            relative = f"{relative_parent}/{entry.name}" if relative_parent else entry.name
            item_stat = entry.stat(follow_symlinks=False)
            mode = stat.S_IMODE(item_stat.st_mode)
            if _is_link_or_reparse(item_stat):
                if reject_symlinks:
                    raise LaneSafetyError(f"symbolic link or reparse point is forbidden in QA lane: {relative}")
                target = os.readlink(entry.path)
                after_stat = entry.stat(follow_symlinks=False)
                if _stable_stat_tuple(item_stat) != _stable_stat_tuple(after_stat):
                    raise LaneSafetyError(f"reparse point changed during inventory: {relative}")
                entries.append({
                    "path": relative,
                    "kind": "symlink",
                    "mode": mode,
                    "mtimeNs": item_stat.st_mtime_ns,
                    "target": target,
                })
                continue
            if stat.S_ISDIR(item_stat.st_mode):
                entries.append({
                    "path": relative,
                    "kind": "directory",
                    "mode": mode,
                    "mtimeNs": item_stat.st_mtime_ns,
                })
                visit(Path(entry.path), relative, item_stat)
                continue
            if stat.S_ISREG(item_stat.st_mode):
                if reject_executables and mode & 0o111:
                    raise LaneSafetyError(f"executable residual is forbidden in QA lane: {relative}")
                file_sha256 = _file_sha256_no_follow(Path(entry.path))
                after_stat = entry.stat(follow_symlinks=False)
                if _stable_stat_tuple(item_stat) != _stable_stat_tuple(after_stat):
                    raise LaneSafetyError(f"file changed during inventory: {relative}")
                entries.append({
                    "path": relative,
                    "kind": "file",
                    "mode": mode,
                    "size": item_stat.st_size,
                    "mtimeNs": item_stat.st_mtime_ns,
                    "sha256": file_sha256,
                })
                continue
            raise LaneSafetyError(f"special filesystem entry is forbidden: {relative}")
    visit(root, "", root_stat)
    after_root_stat = root.lstat()
    if _stable_stat_tuple(root_stat) != _stable_stat_tuple(after_root_stat):
        raise LaneSafetyError(f"inventory root changed during inventory: {root}")
    return _inventory_result(entries)


def inventory_tree(
    root: Path,
    *,
    authority_root: Path | None = None,
    authority_fd: int | None = None,
    reject_symlinks: bool = False,
    reject_executables: bool = False,
) -> dict[str, object]:
    """Inventory a tree with lstat/scandir only; symbolic links are never followed."""

    root = Path(root)
    if os.name == "posix":
        if authority_root is None or authority_fd is None:
            raise LaneSafetyError("POSIX inventory requires an open directory authority")
        return _inventory_tree_posix(
            root,
            Path(authority_root),
            authority_fd,
            reject_symlinks=reject_symlinks,
            reject_executables=reject_executables,
        )
    try:
        root_stat = root.lstat()
    except FileNotFoundError:
        return _absent_inventory()
    if _is_link_or_reparse(root_stat):
        raise LaneSafetyError(f"inventory root must not be a symbolic link: {root}")
    if not stat.S_ISDIR(root_stat.st_mode):
        raise LaneSafetyError(f"inventory root must be a directory: {root}")
    return _inventory_tree_path(
        root,
        root_stat,
        reject_symlinks=reject_symlinks,
        reject_executables=reject_executables,
    )


def _read_bounded_regular_payload(
    path: str | Path,
    *,
    dir_fd: int | None,
    label: str,
) -> bytes:
    before_stat = os.stat(path, dir_fd=dir_fd, follow_symlinks=False)
    if (
        _is_link_or_reparse(before_stat)
        or not stat.S_ISREG(before_stat.st_mode)
        or stat.S_IMODE(before_stat.st_mode) & 0o111
    ):
        raise LaneSafetyError(f"{label} is not a non-executable regular file")
    descriptor = os.open(path, _file_open_flags(), dir_fd=dir_fd)
    try:
        opened_stat = os.fstat(descriptor)
        if not stat.S_ISREG(opened_stat.st_mode):
            raise LaneSafetyError(f"{label} changed type during open")
        if not _same_identity(before_stat, opened_stat):
            raise LaneSafetyError(f"{label} changed identity during open")
        payload = bytearray()
        while len(payload) <= 65536:
            chunk = os.read(descriptor, min(4096, 65537 - len(payload)))
            if not chunk:
                break
            payload.extend(chunk)
        if len(payload) > 65536:
            raise LaneSafetyError(f"{label} is unexpectedly large")
    finally:
        os.close(descriptor)
    after_stat = os.stat(path, dir_fd=dir_fd, follow_symlinks=False)
    if _is_link_or_reparse(after_stat) or _stable_stat_tuple(before_stat) != _stable_stat_tuple(after_stat):
        raise LaneSafetyError(f"{label} changed during read")
    return bytes(payload)


def _read_owner_payload(*, lane_root: Path | None = None, lane_root_fd: int | None = None) -> bytes:
    if (lane_root is None) == (lane_root_fd is None):
        raise LaneSafetyError("owner read requires exactly one lane root authority")
    canary_path: str | Path = OWNER_CANARY_NAME if lane_root_fd is not None else lane_root / OWNER_CANARY_NAME
    return _read_bounded_regular_payload(
        canary_path,
        dir_fd=lane_root_fd,
        label="QA lane owner canary",
    )


def _owner_record(payload: bytes, lane: str, owner: str) -> dict[str, str]:
    expected_payload = _owner_payload(lane, owner)
    if payload != expected_payload:
        raise LaneSafetyError("QA lane owner canary is not the exact canonical owner record")
    try:
        record = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise LaneSafetyError("QA lane owner canary is invalid JSON") from error
    if not isinstance(record, dict):
        raise LaneSafetyError("QA lane owner canary must be an object")
    if record.get("lane") != lane or record.get("owner") != owner:
        raise LaneSafetyError("QA lane owner canary does not match the requested owner")
    return {"lane": str(record["lane"]), "owner": str(record["owner"])}


def _read_owner(
    lane_root: Path,
    lane: str,
    owner: str,
    *,
    authority_root: Path | None = None,
    authority_fd: int | None = None,
) -> dict[str, str]:
    if os.name == "posix":
        if authority_root is None or authority_fd is None:
            raise LaneSafetyError("POSIX owner read requires an open directory authority")
        lane_root_fd, _lane_root_stat = _open_descendant_directory(authority_fd, authority_root, lane_root)
        try:
            payload = _read_published_authority_payload(
                lane_root_fd,
                OWNER_CANARY_NAME,
                _owner_temp_name(owner),
                "QA lane owner canary",
            )
        finally:
            os.close(lane_root_fd)
    else:
        payload = _read_owner_payload(lane_root=lane_root)
    return _owner_record(payload, lane, owner)


def _write_all(descriptor: int, payload: bytes) -> None:
    view = memoryview(payload)
    offset = 0
    while offset < len(view):
        written = os.write(descriptor, view[offset:])
        if written <= 0:
            raise LaneSafetyError("short write while creating QA lane authority file")
        offset += written


def _validated_owner_token(owner: str) -> str:
    normalized = str(owner).strip()
    if not re.fullmatch(r"[0-9a-f]{32}", normalized):
        raise LaneSafetyError("QA lane owner token must be exactly 32 lowercase hexadecimal characters")
    return normalized


def _require_posix_lane_lifecycle() -> None:
    if os.name != "posix":
        raise LaneSafetyError(
            "QA lane lifecycle is fail-closed on Windows until native handle-relative reparse-safe cleanup is implemented"
        )
    missing_constants = [name for name in ("O_NOFOLLOW", "O_DIRECTORY") if not hasattr(os, name)]
    missing_dir_fd = [name for name, function in POSIX_DIR_FD_FUNCTIONS if function not in os.supports_dir_fd]
    missing_nofollow = [
        name
        for name, function in POSIX_NOFOLLOW_FUNCTIONS
        if function not in os.supports_follow_symlinks
    ]
    if missing_constants or missing_dir_fd or missing_nofollow:
        raise LaneSafetyError(
            "QA lane lifecycle requires POSIX O_NOFOLLOW/O_DIRECTORY and dir_fd no-follow hardlink support: "
            f"constants={missing_constants} dir_fd={missing_dir_fd} nofollow={missing_nofollow}"
        )


def _lock_name(lane: str) -> str:
    _lane_record(lane)
    return f"{LOCK_CANARY_PREFIX}{lane}.json"


def _lock_temp_name(lane: str, owner: str) -> str:
    _validated_owner_token(owner)
    return f"{_lock_name(lane)}.pending"


def _owner_temp_name(owner: str) -> str:
    return f"{OWNER_CANARY_NAME}.{_validated_owner_token(owner)}.pending"


def _lock_payload(lane: str, owner: str, real_inventory_sha256: str) -> bytes:
    return json.dumps(
        {
            "lane": lane,
            "owner": owner,
            "realInventorySha256": real_inventory_sha256,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _owner_payload(lane: str, owner: str) -> bytes:
    return json.dumps(
        {"lane": lane, "owner": owner},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _read_descriptor_payload(descriptor: int, label: str) -> bytes:
    os.lseek(descriptor, 0, os.SEEK_SET)
    payload = bytearray()
    while len(payload) <= 65536:
        chunk = os.read(descriptor, min(4096, 65537 - len(payload)))
        if not chunk:
            break
        payload.extend(chunk)
    if len(payload) > 65536:
        raise LaneSafetyError(f"{label} is unexpectedly large")
    return bytes(payload)


def _read_published_authority_payload(
    parent_fd: int,
    published_name: str,
    pending_name: str,
    label: str,
    *,
    allow_pending_link: bool = False,
) -> bytes:
    published_before = os.stat(published_name, dir_fd=parent_fd, follow_symlinks=False)
    if (
        _is_link_or_reparse(published_before)
        or not stat.S_ISREG(published_before.st_mode)
        or stat.S_IMODE(published_before.st_mode) & 0o111
    ):
        raise LaneSafetyError(f"{label} is not a non-executable regular-file authority")
    try:
        pending_before = os.stat(pending_name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        pending_before = None
        expected_nlink = 1
    else:
        if not allow_pending_link:
            raise LaneSafetyError(f"{label} has an incomplete pending publication")
        expected_nlink = 2
        if (
            _is_link_or_reparse(pending_before)
            or not stat.S_ISREG(pending_before.st_mode)
            or stat.S_IMODE(pending_before.st_mode) & 0o111
            or not _same_identity(published_before, pending_before)
        ):
            raise LaneSafetyError(f"{label} pending publication is not the same canonical inode")
    if published_before.st_nlink != expected_nlink or (
        pending_before is not None and pending_before.st_nlink != expected_nlink
    ):
        raise LaneSafetyError(f"{label} has an unexpected hard-link count")
    descriptor = os.open(published_name, _file_open_flags(), dir_fd=parent_fd)
    try:
        opened_stat = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened_stat.st_mode)
            or stat.S_IMODE(opened_stat.st_mode) & 0o111
            or not _same_identity(published_before, opened_stat)
            or opened_stat.st_nlink != expected_nlink
        ):
            raise LaneSafetyError(f"{label} changed during authority open")
        payload = _read_descriptor_payload(descriptor, label)
        published_after = os.stat(published_name, dir_fd=parent_fd, follow_symlinks=False)
        if (
            _stable_stat_tuple(published_before) != _stable_stat_tuple(published_after)
            or published_after.st_nlink != expected_nlink
            or not _same_identity(opened_stat, os.fstat(descriptor))
        ):
            raise LaneSafetyError(f"{label} changed during authority read")
        if pending_before is not None:
            pending_after = os.stat(pending_name, dir_fd=parent_fd, follow_symlinks=False)
            if (
                _stable_stat_tuple(pending_before) != _stable_stat_tuple(pending_after)
                or pending_after.st_nlink != expected_nlink
                or not _same_identity(published_before, pending_after)
            ):
                raise LaneSafetyError(f"{label} pending publication changed during authority read")
        return payload
    finally:
        os.close(descriptor)


def _remove_created_regular_file(
    path: str | Path,
    *,
    dir_fd: int | None,
    opened_stat: os.stat_result,
    expected_nlink: int,
    expected_payload: bytes,
    label: str,
) -> None:
    if dir_fd is None:
        raise LaneSafetyError(f"{label} removal requires a POSIX directory authority")
    try:
        current_stat = os.stat(path, dir_fd=dir_fd, follow_symlinks=False)
    except FileNotFoundError as error:
        raise LaneSafetyError(f"{label} disappeared before exact removal") from error
    if (
        _is_link_or_reparse(current_stat)
        or not stat.S_ISREG(current_stat.st_mode)
        or stat.S_IMODE(current_stat.st_mode) & 0o111
        or not _same_identity(opened_stat, current_stat)
        or current_stat.st_nlink != expected_nlink
    ):
        raise LaneSafetyError(f"{label} changed identity before failed-create rollback")
    descriptor = os.open(path, _file_open_flags(), dir_fd=dir_fd)
    try:
        descriptor_before = os.fstat(descriptor)
        path_before = os.stat(path, dir_fd=dir_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(descriptor_before.st_mode)
            or stat.S_IMODE(descriptor_before.st_mode) & 0o111
            or not _same_identity(opened_stat, descriptor_before)
            or not _same_identity(opened_stat, path_before)
            or descriptor_before.st_nlink != expected_nlink
            or path_before.st_nlink != expected_nlink
            or _read_descriptor_payload(descriptor, label) != expected_payload
        ):
            raise LaneSafetyError(f"{label} changed while opening exact removal authority")
        os.unlink(path, dir_fd=dir_fd)
        try:
            os.stat(path, dir_fd=dir_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise LaneSafetyError(f"{label} still exists after failed-create rollback")
        descriptor_after = os.fstat(descriptor)
        if (
            not _same_identity(opened_stat, descriptor_after)
            or descriptor_after.st_nlink != expected_nlink - 1
            or _read_descriptor_payload(descriptor, label) != expected_payload
        ):
            raise LaneSafetyError(f"{label} retained an unexpected hard link after exact removal")
        os.fsync(dir_fd)
    finally:
        os.close(descriptor)


def _publish_regular_file_exclusive(
    parent_fd: int,
    pending_name: str,
    published_name: str,
    payload: bytes,
    label: str,
) -> None:
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    descriptor = os.open(pending_name, flags, 0o600, dir_fd=parent_fd)
    opened_stat = os.fstat(descriptor)
    published = False
    try:
        if (
            not stat.S_ISREG(opened_stat.st_mode)
            or stat.S_IMODE(opened_stat.st_mode) & 0o111
            or opened_stat.st_nlink != 1
        ):
            raise LaneSafetyError(f"{label} pending file is not a non-executable regular file")
        _write_all(descriptor, payload)
        os.fsync(descriptor)
        prelink_path_stat = os.stat(pending_name, dir_fd=parent_fd, follow_symlinks=False)
        prelink_fd_stat = os.fstat(descriptor)
        if (
            _is_link_or_reparse(prelink_path_stat)
            or not stat.S_ISREG(prelink_path_stat.st_mode)
            or stat.S_IMODE(prelink_path_stat.st_mode) & 0o111
            or not _same_identity(opened_stat, prelink_path_stat)
            or not _same_identity(opened_stat, prelink_fd_stat)
            or prelink_path_stat.st_nlink != 1
            or prelink_fd_stat.st_nlink != 1
            or _read_descriptor_payload(descriptor, label) != payload
        ):
            raise LaneSafetyError(f"{label} pending file changed before atomic publish")
        os.link(
            pending_name,
            published_name,
            src_dir_fd=parent_fd,
            dst_dir_fd=parent_fd,
            follow_symlinks=False,
        )
        published = True
        os.fsync(parent_fd)
        pending_after_link = os.stat(pending_name, dir_fd=parent_fd, follow_symlinks=False)
        published_after_link = os.stat(published_name, dir_fd=parent_fd, follow_symlinks=False)
        descriptor_after_link = os.fstat(descriptor)
        if (
            _is_link_or_reparse(pending_after_link)
            or _is_link_or_reparse(published_after_link)
            or not stat.S_ISREG(pending_after_link.st_mode)
            or not stat.S_ISREG(published_after_link.st_mode)
            or stat.S_IMODE(pending_after_link.st_mode) & 0o111
            or stat.S_IMODE(published_after_link.st_mode) & 0o111
            or not _same_identity(opened_stat, pending_after_link)
            or not _same_identity(opened_stat, published_after_link)
            or not _same_identity(opened_stat, descriptor_after_link)
            or pending_after_link.st_nlink != 2
            or published_after_link.st_nlink != 2
            or descriptor_after_link.st_nlink != 2
            or _read_descriptor_payload(descriptor, label) != payload
        ):
            raise LaneSafetyError(f"{label} atomic publish did not preserve one canonical inode")
        _remove_created_regular_file(
            pending_name,
            dir_fd=parent_fd,
            opened_stat=opened_stat,
            expected_nlink=2,
            expected_payload=payload,
            label=f"{label} pending file",
        )
        published_after_unlink = os.stat(published_name, dir_fd=parent_fd, follow_symlinks=False)
        descriptor_after_unlink = os.fstat(descriptor)
        if (
            _is_link_or_reparse(published_after_unlink)
            or not stat.S_ISREG(published_after_unlink.st_mode)
            or stat.S_IMODE(published_after_unlink.st_mode) & 0o111
            or not _same_identity(opened_stat, published_after_unlink)
            or not _same_identity(opened_stat, descriptor_after_unlink)
            or published_after_unlink.st_nlink != 1
            or descriptor_after_unlink.st_nlink != 1
            or _read_descriptor_payload(descriptor, label) != payload
        ):
            raise LaneSafetyError(f"{label} published file changed after pending unlink")
        os.fsync(parent_fd)
    except BaseException as publish_error:
        if not published:
            try:
                rollback_payload = _read_descriptor_payload(descriptor, label)
                _remove_created_regular_file(
                    pending_name,
                    dir_fd=parent_fd,
                    opened_stat=opened_stat,
                    expected_nlink=1,
                    expected_payload=rollback_payload,
                    label=f"{label} pending file",
                )
                os.fsync(parent_fd)
            except BaseException as rollback_error:
                raise LaneSafetyError(
                    f"{label} creation failed and exact pending rollback could not be proven: {rollback_error}"
                ) from publish_error
        raise
    finally:
        os.close(descriptor)


def _remove_pending_lock(
    data_base: Path,
    lane: str,
    owner: str,
    *,
    data_base_fd: int | None,
    expected_payload_sha256: str,
) -> bool:
    if data_base_fd is None:
        raise LaneSafetyError("pending lock removal requires a POSIX data-base authority")
    name: str | Path = (
        _lock_temp_name(lane, owner)
        if data_base_fd is not None
        else data_base / _lock_temp_name(lane, owner)
    )
    try:
        pending_stat = os.stat(name, dir_fd=data_base_fd, follow_symlinks=False)
    except FileNotFoundError:
        if expected_payload_sha256 != "":
            raise LaneSafetyError("QA lane pending owner lock disappeared after inspection")
        return False
    if (
        _is_link_or_reparse(pending_stat)
        or not stat.S_ISREG(pending_stat.st_mode)
        or stat.S_IMODE(pending_stat.st_mode) & 0o111
    ):
        raise LaneSafetyError("QA lane pending owner lock is not a non-executable regular file")
    pending_payload = _read_bounded_regular_payload(
        name,
        dir_fd=data_base_fd,
        label="QA lane pending owner lock",
    )
    actual_payload_sha256 = hashlib.sha256(pending_payload).hexdigest()
    if actual_payload_sha256 != expected_payload_sha256:
        raise LaneSafetyError("QA lane pending owner lock payload changed after inspection")
    _lock_real_inventory_sha256(pending_payload, lane, owner)
    try:
        published_stat = os.stat(_lock_name(lane), dir_fd=data_base_fd, follow_symlinks=False)
    except FileNotFoundError:
        published_stat = None
    expected_nlink = 1
    if published_stat is not None:
        if (
            _is_link_or_reparse(published_stat)
            or not stat.S_ISREG(published_stat.st_mode)
            or stat.S_IMODE(published_stat.st_mode) & 0o111
            or not _same_identity(pending_stat, published_stat)
            or pending_stat.st_nlink != 2
            or published_stat.st_nlink != 2
        ):
            raise LaneSafetyError("QA lane pending owner lock does not match one published authority inode")
        expected_nlink = 2
    elif pending_stat.st_nlink != 1:
        raise LaneSafetyError("QA lane unpublished pending owner lock has unexpected hard links")
    _remove_created_regular_file(
        name,
        dir_fd=data_base_fd,
        opened_stat=pending_stat,
        expected_nlink=expected_nlink,
        expected_payload=pending_payload,
        label="QA lane pending owner lock",
    )
    os.fsync(data_base_fd)
    return True


def _write_lock_exclusive(
    data_base: Path,
    lane: str,
    owner: str,
    real_inventory_sha256: str,
    *,
    data_base_fd: int | None,
) -> None:
    if data_base_fd is None:
        raise LaneSafetyError("lock creation requires a POSIX data-base authority")
    _publish_regular_file_exclusive(
        data_base_fd,
        _lock_temp_name(lane, owner),
        _lock_name(lane),
        _lock_payload(lane, owner, real_inventory_sha256),
        "QA lane external owner lock",
    )


def _read_lock(
    data_base: Path,
    lane: str,
    owner: str,
    *,
    data_base_fd: int | None,
) -> str:
    if data_base_fd is None:
        raise LaneSafetyError("lock read requires a POSIX data-base authority")
    payload = _read_published_authority_payload(
        data_base_fd,
        _lock_name(lane),
        _lock_temp_name(lane, owner),
        "QA lane external owner lock",
    )
    return _lock_real_inventory_sha256(payload, lane, owner)


def _read_recoverable_lock(
    data_base: Path,
    lane: str,
    owner: str,
    *,
    data_base_fd: int | None,
) -> str:
    if data_base_fd is None:
        raise LaneSafetyError("recoverable lock read requires a POSIX data-base authority")
    payload = _read_published_authority_payload(
        data_base_fd,
        _lock_name(lane),
        _lock_temp_name(lane, owner),
        "QA lane external owner lock",
        allow_pending_link=True,
    )
    return _lock_real_inventory_sha256(payload, lane, owner)


def _lock_real_inventory_sha256(payload: bytes, lane: str, owner: str) -> str:
    try:
        record = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise LaneSafetyError("QA lane external owner lock is invalid JSON") from error
    if not isinstance(record, dict):
        raise LaneSafetyError("QA lane external owner lock must be an object")
    real_inventory_sha256 = str(record.get("realInventorySha256", ""))
    expected = _lock_payload(lane, owner, real_inventory_sha256)
    if payload != expected or not re.fullmatch(r"[0-9a-f]{64}", real_inventory_sha256):
        raise LaneSafetyError("QA lane external owner lock is not the exact canonical owner record")
    return real_inventory_sha256


def _remove_lock_exact(
    data_base: Path,
    lane: str,
    owner: str,
    *,
    data_base_fd: int | None,
) -> None:
    name: str | Path = _lock_name(lane) if data_base_fd is not None else data_base / _lock_name(lane)
    expected_real_sha256 = _read_lock(data_base, lane, owner, data_base_fd=data_base_fd)
    expected_payload = _lock_payload(lane, owner, expected_real_sha256)
    before_stat = os.stat(name, dir_fd=data_base_fd, follow_symlinks=False)
    if (
        _is_link_or_reparse(before_stat)
        or not stat.S_ISREG(before_stat.st_mode)
        or stat.S_IMODE(before_stat.st_mode) & 0o111
        or before_stat.st_nlink != 1
    ):
        raise LaneSafetyError("QA lane external owner lock changed type before removal")
    descriptor = os.open(name, _file_open_flags(), dir_fd=data_base_fd)
    try:
        opened_stat = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened_stat.st_mode)
            or stat.S_IMODE(opened_stat.st_mode) & 0o111
            or not _same_identity(before_stat, opened_stat)
            or opened_stat.st_nlink != 1
            or _read_descriptor_payload(descriptor, "QA lane external owner lock") != expected_payload
        ):
            raise LaneSafetyError("QA lane external owner lock changed before final removal")
        path_stat = os.stat(name, dir_fd=data_base_fd, follow_symlinks=False)
        if _stable_stat_tuple(before_stat) != _stable_stat_tuple(path_stat) or path_stat.st_nlink != 1:
            raise LaneSafetyError("QA lane external owner lock changed during final removal check")
        os.unlink(name, dir_fd=data_base_fd)
        try:
            os.stat(name, dir_fd=data_base_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise LaneSafetyError("QA lane external owner lock still exists after removal")
        descriptor_after_unlink = os.fstat(descriptor)
        if not _same_identity(opened_stat, descriptor_after_unlink) or descriptor_after_unlink.st_nlink != 0:
            raise LaneSafetyError("QA lane external owner lock retained an unexpected hard link after removal")
        os.fsync(data_base_fd)
    finally:
        os.close(descriptor)


def _write_owner_exclusive(
    lane_root: Path,
    lane: str,
    owner: str,
    *,
    authority_root: Path | None = None,
    authority_fd: int | None = None,
) -> None:
    if authority_root is None or authority_fd is None:
        raise LaneSafetyError("POSIX owner creation requires an open directory authority")
    lane_root_fd, _lane_root_stat = _open_descendant_directory(authority_fd, authority_root, lane_root)
    try:
        _publish_regular_file_exclusive(
            lane_root_fd,
            _owner_temp_name(owner),
            OWNER_CANARY_NAME,
            _owner_payload(lane, owner),
            "QA lane owner canary",
        )
    finally:
        os.close(lane_root_fd)


def _remove_pending_owner(
    lane_root: Path,
    lane: str,
    owner: str,
    *,
    authority_root: Path,
    authority_fd: int,
    expected_payload_sha256: str,
    allow_incomplete_unpublished: bool,
) -> bool:
    lane_root_fd, _lane_root_stat = _open_descendant_directory(authority_fd, authority_root, lane_root)
    try:
        pending_name = _owner_temp_name(owner)
        try:
            pending_stat = os.stat(pending_name, dir_fd=lane_root_fd, follow_symlinks=False)
        except FileNotFoundError:
            return False
        if (
            _is_link_or_reparse(pending_stat)
            or not stat.S_ISREG(pending_stat.st_mode)
            or stat.S_IMODE(pending_stat.st_mode) & 0o111
        ):
            raise LaneSafetyError("QA lane pending owner canary is not a non-executable regular file")
        pending_payload = _read_bounded_regular_payload(
            pending_name,
            dir_fd=lane_root_fd,
            label="QA lane pending owner canary",
        )
        if hashlib.sha256(pending_payload).hexdigest() != expected_payload_sha256:
            raise LaneSafetyError("QA lane pending owner canary payload changed after inspection")
        try:
            published_stat = os.stat(OWNER_CANARY_NAME, dir_fd=lane_root_fd, follow_symlinks=False)
        except FileNotFoundError:
            published_stat = None
        expected_nlink = 1
        if published_stat is not None:
            _owner_record(pending_payload, lane, owner)
            if (
                _is_link_or_reparse(published_stat)
                or not stat.S_ISREG(published_stat.st_mode)
                or stat.S_IMODE(published_stat.st_mode) & 0o111
                or not _same_identity(pending_stat, published_stat)
                or pending_stat.st_nlink != 2
                or published_stat.st_nlink != 2
            ):
                raise LaneSafetyError("QA lane pending owner canary does not match one published authority inode")
            expected_nlink = 2
        elif pending_stat.st_nlink != 1:
            raise LaneSafetyError("QA lane unpublished pending owner canary has unexpected hard links")
        elif not allow_incomplete_unpublished:
            _owner_record(pending_payload, lane, owner)
        _remove_created_regular_file(
            pending_name,
            dir_fd=lane_root_fd,
            opened_stat=pending_stat,
            expected_nlink=expected_nlink,
            expected_payload=pending_payload,
            label="QA lane pending owner canary",
        )
        os.fsync(lane_root_fd)
        return True
    finally:
        os.close(lane_root_fd)


def _remove_owner_canary_exact(lane_root_fd: int, lane: str, owner: str) -> None:
    expected_payload = _owner_payload(lane, owner)
    before_stat = os.stat(OWNER_CANARY_NAME, dir_fd=lane_root_fd, follow_symlinks=False)
    if (
        _is_link_or_reparse(before_stat)
        or not stat.S_ISREG(before_stat.st_mode)
        or stat.S_IMODE(before_stat.st_mode) & 0o111
        or before_stat.st_nlink != 1
    ):
        raise LaneSafetyError("QA lane owner canary changed type before final removal")
    descriptor = os.open(OWNER_CANARY_NAME, _file_open_flags(), dir_fd=lane_root_fd)
    try:
        opened_stat = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened_stat.st_mode)
            or stat.S_IMODE(opened_stat.st_mode) & 0o111
            or not _same_identity(before_stat, opened_stat)
            or opened_stat.st_nlink != 1
            or _read_descriptor_payload(descriptor, "QA lane owner canary") != expected_payload
        ):
            raise LaneSafetyError("QA lane owner canary changed before final removal")
        path_stat = os.stat(OWNER_CANARY_NAME, dir_fd=lane_root_fd, follow_symlinks=False)
        if _stable_stat_tuple(before_stat) != _stable_stat_tuple(path_stat) or path_stat.st_nlink != 1:
            raise LaneSafetyError("QA lane owner canary changed during final removal check")
        os.unlink(OWNER_CANARY_NAME, dir_fd=lane_root_fd)
        try:
            os.stat(OWNER_CANARY_NAME, dir_fd=lane_root_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise LaneSafetyError("QA lane owner canary still exists after final removal")
        descriptor_after_unlink = os.fstat(descriptor)
        if not _same_identity(opened_stat, descriptor_after_unlink) or descriptor_after_unlink.st_nlink != 0:
            raise LaneSafetyError("QA lane owner canary retained an unexpected hard link after final removal")
        os.fsync(lane_root_fd)
    finally:
        os.close(descriptor)


def prepare_lane(lane: str, existing_features: str = "", owner: str = "") -> dict[str, object]:
    _require_posix_lane_lifecycle()
    paths, data_base, lane_root, real_root = _canonical_current_paths(lane)
    editor_custom_features = merge_editor_custom_features(existing_features, paths.feature)
    owner_token = _validated_owner_token(owner)
    data_base_fd: int | None = None
    created_lane_fd: int | None = None
    created_lane_stat: os.stat_result | None = None
    if os.name == "posix":
        data_base_fd, _data_base_stat = _open_current_data_base(data_base)
    lane_created = False
    lock_created = False
    owner_written = False
    try:
        real_inventory = inventory_tree(
            real_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        try:
            _write_lock_exclusive(
                data_base,
                lane,
                owner_token,
                str(real_inventory["sha256"]),
                data_base_fd=data_base_fd,
            )
            lock_created = True
        except FileExistsError as error:
            raise LaneSafetyError(f"QA lane is already owned, locked, or has residual data: {lane_root}") from error
        try:
            if os.name == "posix":
                os.mkdir(lane_root.name, mode=0o700, dir_fd=data_base_fd)
            else:
                lane_root.mkdir(mode=0o700, parents=False, exist_ok=False)
            lane_created = True
            if data_base_fd is None:
                raise LaneSafetyError("QA lane creation requires a POSIX data-base authority")
            created_lane_fd, created_lane_stat = _open_directory_no_follow(
                lane_root.name,
                dir_fd=data_base_fd,
            )
        except FileExistsError as error:
            raise LaneSafetyError(f"QA lane is already owned or has residual data: {lane_root}") from error
        _write_owner_exclusive(
            lane_root,
            lane,
            owner_token,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        owner_written = True
        lane_inventory = inventory_tree(
            lane_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
            reject_symlinks=True,
            reject_executables=True,
        )
        return {
            "status": "prepared",
            "lane": lane,
            "owner": owner_token,
            "feature": paths.feature,
            "customUserDirName": paths.custom_user_dir_name,
            "laneRoot": str(lane_root),
            "godotLaneRoot": paths.godot_lane_root,
            "realRoot": str(real_root),
            "godotRealRoot": paths.godot_real_root,
            "realInventorySha256": real_inventory["sha256"],
            "realEntryCount": real_inventory["entryCount"],
            "laneInventorySha256": lane_inventory["sha256"],
            "laneEntryCount": lane_inventory["entryCount"],
            "editorCustomFeatures": editor_custom_features,
        }
    except BaseException as prepare_error:
        if lane_created:
            try:
                if owner_written:
                    _remove_tree_no_follow(
                        lane_root,
                        lane,
                        owner_token,
                        authority_root=data_base,
                        authority_fd=data_base_fd,
                    )
                else:
                    if data_base_fd is None or created_lane_fd is None or created_lane_stat is None:
                        raise LaneSafetyError(
                            "QA lane created root authority was not captured before rollback"
                        )
                    _remove_empty_directory_posix(
                        data_base_fd,
                        lane_root.name,
                        created_lane_fd,
                        created_lane_stat,
                        "new QA lane root",
                    )
                if created_lane_fd is None or created_lane_stat is None:
                    raise LaneSafetyError("QA lane created root descriptor is unavailable after rollback")
                created_after_rollback = os.fstat(created_lane_fd)
                if not _same_identity(created_lane_stat, created_after_rollback):
                    raise LaneSafetyError("QA lane created root retained a namespace link after rollback")
            except BaseException as rollback_error:
                raise LaneSafetyError(
                    f"QA lane prepare failed and exact rollback could not be proven: {rollback_error}"
                ) from prepare_error
        if lock_created:
            try:
                _remove_lock_exact(
                    data_base,
                    lane,
                    owner_token,
                    data_base_fd=data_base_fd,
                )
            except BaseException as rollback_error:
                raise LaneSafetyError(
                    f"QA lane prepare failed and external lock rollback could not be proven: {rollback_error}"
                ) from prepare_error
        raise
    finally:
        if created_lane_fd is not None:
            os.close(created_lane_fd)
        if data_base_fd is not None:
            os.close(data_base_fd)


def verify_lane(lane: str, owner: str, expected_real_sha256: str) -> dict[str, object]:
    _require_posix_lane_lifecycle()
    paths, data_base, lane_root, real_root = _canonical_current_paths(lane)
    data_base_fd: int | None = None
    if os.name == "posix":
        data_base_fd, _data_base_stat = _open_current_data_base(data_base)
    try:
        locked_real_sha256 = _read_lock(
            data_base,
            lane,
            owner,
            data_base_fd=data_base_fd,
        )
        if locked_real_sha256 != expected_real_sha256:
            raise LaneSafetyError("QA lane external owner lock real-root baseline does not match verification")
        if os.name != "posix" and (not lane_root.exists() or _path_is_link_or_reparse(lane_root)):
            raise LaneSafetyError("owned QA lane root is missing or is a symbolic link")
        _read_owner(
            lane_root,
            lane,
            owner,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        lane_inventory = inventory_tree(
            lane_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
            reject_symlinks=True,
            reject_executables=True,
        )
        real_inventory = inventory_tree(
            real_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        real_unchanged = real_inventory["sha256"] == expected_real_sha256
        if not real_unchanged:
            raise LaneSafetyError(
                f"real Godot user-data root changed: expected={expected_real_sha256} actual={real_inventory['sha256']}"
            )
        return {
            "status": "verified",
            "lane": lane,
            "owner": owner,
            "feature": paths.feature,
            "laneRoot": str(lane_root),
            "godotLaneRoot": paths.godot_lane_root,
            "realRoot": str(real_root),
            "realInventorySha256": real_inventory["sha256"],
            "realEntryCount": real_inventory["entryCount"],
            "realUnchanged": True,
            "laneInventorySha256": lane_inventory["sha256"],
            "laneEntryCount": lane_inventory["entryCount"],
        }
    finally:
        if data_base_fd is not None:
            os.close(data_base_fd)


def _remove_regular_file_posix(
    directory_fd: int,
    name: str,
    observed_stat: os.stat_result,
    relative: str,
) -> None:
    if (
        _is_link_or_reparse(observed_stat)
        or not stat.S_ISREG(observed_stat.st_mode)
        or stat.S_IMODE(observed_stat.st_mode) & 0o111
        or observed_stat.st_nlink != 1
    ):
        raise LaneSafetyError(f"refusing to remove unsafe regular QA lane entry: {relative}")
    descriptor = os.open(name, _file_open_flags(), dir_fd=directory_fd)
    try:
        opened_stat = os.fstat(descriptor)
        path_before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if (
            _is_link_or_reparse(path_before)
            or not stat.S_ISREG(opened_stat.st_mode)
            or not stat.S_ISREG(path_before.st_mode)
            or stat.S_IMODE(opened_stat.st_mode) & 0o111
            or stat.S_IMODE(path_before.st_mode) & 0o111
            or not _same_identity(observed_stat, opened_stat)
            or not _same_identity(observed_stat, path_before)
            or opened_stat.st_nlink != 1
            or path_before.st_nlink != 1
            or _stable_stat_tuple(observed_stat) != _stable_stat_tuple(path_before)
        ):
            raise LaneSafetyError(f"file changed identity before cleanup: {relative}")
        os.unlink(name, dir_fd=directory_fd)
        try:
            os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise LaneSafetyError(f"file still exists after cleanup: {relative}")
        descriptor_after = os.fstat(descriptor)
        if not _same_identity(opened_stat, descriptor_after) or descriptor_after.st_nlink != 0:
            raise LaneSafetyError(f"file was renamed or replaced during cleanup: {relative}")
        os.fsync(directory_fd)
    finally:
        os.close(descriptor)


def _remove_empty_directory_posix(
    parent_fd: int,
    name: str,
    directory_fd: int,
    observed_stat: os.stat_result,
    label: str,
) -> None:
    with os.scandir(directory_fd) as iterator:
        if any(True for _entry in iterator):
            raise LaneSafetyError(f"{label} is not empty before exact removal")
    descriptor_before = os.fstat(directory_fd)
    path_before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    parent_before = os.stat("..", dir_fd=directory_fd, follow_symlinks=False)
    parent_authority = os.fstat(parent_fd)
    if (
        _is_link_or_reparse(path_before)
        or not stat.S_ISDIR(descriptor_before.st_mode)
        or not stat.S_ISDIR(path_before.st_mode)
        or not _same_identity(observed_stat, descriptor_before)
        or not _same_identity(observed_stat, path_before)
        or not _same_identity(parent_before, parent_authority)
        or descriptor_before.st_nlink <= 0
        or path_before.st_nlink != descriptor_before.st_nlink
    ):
        raise LaneSafetyError(f"{label} changed identity before exact rmdir")
    os.rmdir(name, dir_fd=parent_fd)
    try:
        os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        raise LaneSafetyError(f"{label} still exists after exact rmdir")
    descriptor_after = os.fstat(directory_fd)
    parent_after = os.stat("..", dir_fd=directory_fd, follow_symlinks=False)
    if (
        not _same_identity(observed_stat, descriptor_after)
        or not _same_identity(parent_after, parent_authority)
        or _directory_has_identity(parent_fd, observed_stat)
        or descriptor_after.st_nlink < 0
        or descriptor_after.st_nlink > descriptor_before.st_nlink
    ):
        raise LaneSafetyError(f"{label} was renamed or replaced during exact rmdir")
    os.fsync(parent_fd)


def _remove_directory_contents_posix(
    directory_fd: int,
    relative_parent: str,
    preserve_names: frozenset[str] = frozenset(),
) -> None:
    with os.scandir(directory_fd) as iterator:
        names = sorted((entry.name for entry in iterator), reverse=True)
    for name in names:
        if name in preserve_names:
            continue
        relative = f"{relative_parent}/{name}" if relative_parent else name
        item_stat = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if _is_link_or_reparse(item_stat):
            raise LaneSafetyError(f"refusing to remove symbolic link or reparse point from QA lane: {relative}")
        if stat.S_ISDIR(item_stat.st_mode):
            child_fd, opened_child_stat = _open_directory_no_follow(name, dir_fd=directory_fd)
            try:
                if not _same_identity(item_stat, opened_child_stat):
                    raise LaneSafetyError(f"directory changed identity before cleanup: {relative}")
                _remove_directory_contents_posix(child_fd, relative)
                _remove_empty_directory_posix(
                    directory_fd,
                    name,
                    child_fd,
                    opened_child_stat,
                    f"QA lane directory {relative}",
                )
            finally:
                os.close(child_fd)
            continue
        if stat.S_ISREG(item_stat.st_mode):
            _remove_regular_file_posix(directory_fd, name, item_stat, relative)
            continue
        raise LaneSafetyError(f"refusing to remove special QA lane entry: {relative}")


def _directory_has_identity(directory_fd: int, expected_stat: os.stat_result) -> bool:
    with os.scandir(directory_fd) as iterator:
        names = [entry.name for entry in iterator]
    for name in names:
        try:
            item_stat = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except FileNotFoundError:
            continue
        if _same_identity(item_stat, expected_stat):
            return True
    return False


def _remove_tree_posix(
    root: Path,
    lane: str,
    owner: str,
    *,
    authority_root: Path,
    authority_fd: int,
) -> None:
    root_fd, root_stat = _open_descendant_directory(authority_fd, authority_root, root)
    try:
        _owner_record(
            _read_published_authority_payload(
                root_fd,
                OWNER_CANARY_NAME,
                _owner_temp_name(owner),
                "QA lane owner canary",
            ),
            lane,
            owner,
        )
        _remove_directory_contents_posix(root_fd, "", frozenset({OWNER_CANARY_NAME}))
        with os.scandir(root_fd) as iterator:
            remaining_before_owner = sorted(entry.name for entry in iterator)
        if remaining_before_owner != [OWNER_CANARY_NAME]:
            raise LaneSafetyError("QA lane cleanup must preserve only the exact owner canary until the final unlink")
        _remove_owner_canary_exact(root_fd, lane, owner)
        with os.scandir(root_fd) as iterator:
            if any(True for _entry in iterator):
                raise LaneSafetyError("QA lane contains residual data after owner-last cleanup")
        root_components = _relative_directory_components(root, authority_root)
        if len(root_components) != 1:
            raise LaneSafetyError("QA lane cleanup target must be one fixed direct child of its authority")
        root_name = root_components[0]
        _remove_empty_directory_posix(
            authority_fd,
            root_name,
            root_fd,
            root_stat,
            "QA lane root",
        )
    finally:
        os.close(root_fd)


def _remove_tree_path(root: Path, expected_stat: os.stat_result | None = None) -> None:
    root_stat = root.lstat()
    if _is_link_or_reparse(root_stat) or not stat.S_ISDIR(root_stat.st_mode):
        raise LaneSafetyError(f"refusing to remove non-directory or reparse QA lane root: {root}")
    if expected_stat is not None and not _same_identity(expected_stat, root_stat):
        raise LaneSafetyError(f"QA lane directory changed identity before cleanup: {root}")
    with os.scandir(root) as iterator:
        children = sorted(iterator, key=lambda entry: entry.name, reverse=True)
    for entry in children:
        item_stat = entry.stat(follow_symlinks=False)
        if _is_link_or_reparse(item_stat):
            raise LaneSafetyError(f"refusing to remove symbolic link or reparse point from QA lane: {entry.name}")
        if stat.S_ISDIR(item_stat.st_mode):
            _remove_tree_path(Path(entry.path), item_stat)
        elif stat.S_ISREG(item_stat.st_mode):
            if stat.S_IMODE(item_stat.st_mode) & 0o111:
                raise LaneSafetyError(f"refusing to remove executable residual from QA lane: {entry.name}")
            descriptor = os.open(entry.path, _file_open_flags())
            try:
                opened_stat = os.fstat(descriptor)
                if not stat.S_ISREG(opened_stat.st_mode) or not _same_identity(item_stat, opened_stat):
                    raise LaneSafetyError(f"QA lane file changed identity before cleanup: {entry.name}")
            finally:
                os.close(descriptor)
            after_stat = os.lstat(entry.path)
            if (
                _is_link_or_reparse(after_stat)
                or not stat.S_ISREG(after_stat.st_mode)
                or stat.S_IMODE(after_stat.st_mode) & 0o111
                or not _same_identity(item_stat, after_stat)
                or _stable_stat_tuple(item_stat) != _stable_stat_tuple(after_stat)
            ):
                raise LaneSafetyError(f"QA lane file changed identity during cleanup: {entry.name}")
            os.unlink(entry.path)
        else:
            raise LaneSafetyError(f"refusing to remove special QA lane entry: {entry.name}")
    after_root_stat = root.lstat()
    if (
        _is_link_or_reparse(after_root_stat)
        or not stat.S_ISDIR(after_root_stat.st_mode)
        or not _same_identity(root_stat, after_root_stat)
    ):
        raise LaneSafetyError(f"QA lane directory changed identity during cleanup: {root}")
    os.rmdir(root)


def _remove_tree_no_follow(
    root: Path,
    lane: str,
    owner: str,
    *,
    authority_root: Path | None = None,
    authority_fd: int | None = None,
) -> None:
    if os.name == "posix":
        if authority_root is None or authority_fd is None:
            raise LaneSafetyError("POSIX cleanup requires an open directory authority")
        _remove_tree_posix(
            root,
            lane,
            owner,
            authority_root=authority_root,
            authority_fd=authority_fd,
        )
        return
    _read_owner(root, lane, owner)
    _remove_tree_path(root)


def cleanup_lane(lane: str, owner: str, expected_real_sha256: str) -> dict[str, object]:
    _require_posix_lane_lifecycle()
    paths, data_base, lane_root, real_root = _canonical_current_paths(lane)
    data_base_fd: int | None = None
    if os.name == "posix":
        data_base_fd, _data_base_stat = _open_current_data_base(data_base)
    try:
        locked_real_sha256 = _read_lock(
            data_base,
            lane,
            owner,
            data_base_fd=data_base_fd,
        )
        if locked_real_sha256 != expected_real_sha256:
            raise LaneSafetyError("QA lane external owner lock real-root baseline does not match cleanup")
        if os.name != "posix" and (not lane_root.exists() or _path_is_link_or_reparse(lane_root)):
            raise LaneSafetyError("owned QA lane root is missing or is a symbolic link")
        _read_owner(
            lane_root,
            lane,
            owner,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        lane_inventory = inventory_tree(
            lane_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
            reject_symlinks=True,
            reject_executables=True,
        )
        real_before_cleanup = inventory_tree(
            real_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        if real_before_cleanup["sha256"] != expected_real_sha256:
            raise LaneSafetyError("real Godot user-data root changed before cleanup; lane and lock preserved")
        _remove_tree_no_follow(
            lane_root,
            lane,
            owner,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        if os.name == "posix":
            try:
                os.stat(lane_root.name, dir_fd=data_base_fd, follow_symlinks=False)
            except FileNotFoundError:
                pass
            else:
                raise LaneSafetyError("exact QA lane root still exists after cleanup")
        elif lane_root.exists() or _path_is_link_or_reparse(lane_root):
            raise LaneSafetyError("exact QA lane root still exists after cleanup")
        real_after_lane_removal = inventory_tree(
            real_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        if real_after_lane_removal["sha256"] != expected_real_sha256:
            raise LaneSafetyError("real Godot user-data root changed during lane cleanup; external lock preserved")
        _remove_lock_exact(
            data_base,
            lane,
            owner,
            data_base_fd=data_base_fd,
        )
        real_after_cleanup = inventory_tree(
            real_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        real_unchanged = (
            real_before_cleanup["sha256"] == expected_real_sha256
            and real_after_cleanup["sha256"] == expected_real_sha256
        )
        result = {
            "status": "cleaned" if real_unchanged else "real_root_changed",
            "lane": lane,
            "owner": owner,
            "feature": paths.feature,
            "laneRoot": str(lane_root),
            "laneAbsent": True,
            "removedLaneInventorySha256": lane_inventory["sha256"],
            "removedLaneEntryCount": lane_inventory["entryCount"],
            "realRoot": str(real_root),
            "realInventorySha256": real_after_cleanup["sha256"],
            "realUnchanged": real_unchanged,
        }
        if not real_unchanged:
            raise LaneSafetyError(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return result
    finally:
        if data_base_fd is not None:
            os.close(data_base_fd)


def _remove_incomplete_lane_for_recovery(
    data_base: Path,
    lane_root: Path,
    *,
    data_base_fd: int | None,
) -> None:
    if data_base_fd is None:
        raise LaneSafetyError("incomplete lane recovery requires a POSIX data-base authority")
    try:
        lane_fd, lane_stat = _open_descendant_directory(data_base_fd, data_base, lane_root)
    except FileNotFoundError:
        return
    try:
        with os.scandir(lane_fd) as iterator:
            children = sorted(entry.name for entry in iterator)
        if children:
            raise LaneSafetyError("incomplete QA lane is not empty; recovery refused")
        _remove_empty_directory_posix(
            data_base_fd,
            lane_root.name,
            lane_fd,
            lane_stat,
            "incomplete QA lane",
        )
    finally:
        os.close(lane_fd)


def _inspection_sha256(report: Mapping[str, object]) -> str:
    payload = json.dumps(
        dict(report),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def inspect_lane(lane: str, owner: str) -> dict[str, object]:
    """Read-only evidence for an original owner before a manual recover decision."""

    _require_posix_lane_lifecycle()
    paths, data_base, lane_root, real_root = _canonical_current_paths(lane)
    owner_token = _validated_owner_token(owner)
    data_base_fd, _data_base_stat = _open_current_data_base(data_base)
    try:
        pending_name = _lock_temp_name(lane, owner_token)
        pending_payload_sha256 = ""
        pending_locked_real_sha256 = ""
        try:
            pending_stat = os.stat(pending_name, dir_fd=data_base_fd, follow_symlinks=False)
        except FileNotFoundError:
            pending_state = "absent"
        else:
            if (
                _is_link_or_reparse(pending_stat)
                or not stat.S_ISREG(pending_stat.st_mode)
                or stat.S_IMODE(pending_stat.st_mode) & 0o111
            ):
                pending_state = "unsafe"
            else:
                try:
                    pending_payload = _read_bounded_regular_payload(
                        pending_name,
                        dir_fd=data_base_fd,
                        label="QA lane pending owner lock",
                    )
                    pending_locked_real_sha256 = _lock_real_inventory_sha256(
                        pending_payload,
                        lane,
                        owner_token,
                    )
                except (LaneSafetyError, OSError):
                    pending_state = "invalid"
                else:
                    pending_state = "canonical"
                    pending_payload_sha256 = hashlib.sha256(pending_payload).hexdigest()
        try:
            locked_real_sha256 = _read_recoverable_lock(
                data_base,
                lane,
                owner_token,
                data_base_fd=data_base_fd,
            )
        except FileNotFoundError:
            published_lock_state = "absent"
            locked_real_sha256 = ""
        except (LaneSafetyError, OSError):
            published_lock_state = "invalid"
            locked_real_sha256 = ""
        else:
            published_lock_state = "canonical"
        try:
            lane_root_stat = os.stat(lane_root.name, dir_fd=data_base_fd, follow_symlinks=False)
        except FileNotFoundError:
            lane_root_state = "absent"
            owner_canary_state = "not_applicable"
            pending_owner_state = "not_applicable"
            pending_owner_payload_sha256 = ""
        else:
            if _is_link_or_reparse(lane_root_stat) or not stat.S_ISDIR(lane_root_stat.st_mode):
                lane_root_state = "unsafe"
                owner_canary_state = "unreadable"
                pending_owner_state = "unreadable"
                pending_owner_payload_sha256 = ""
            else:
                lane_root_state = "directory"
                pending_owner_payload_sha256 = ""
                lane_fd, _opened_lane_stat = _open_descendant_directory(data_base_fd, data_base, lane_root)
                try:
                    try:
                        owner_payload = _read_published_authority_payload(
                            lane_fd,
                            OWNER_CANARY_NAME,
                            _owner_temp_name(owner_token),
                            "QA lane owner canary",
                            allow_pending_link=True,
                        )
                    except FileNotFoundError:
                        owner_canary_state = "absent"
                    except (LaneSafetyError, OSError):
                        owner_canary_state = "invalid"
                    else:
                        try:
                            _owner_record(owner_payload, lane, owner_token)
                        except LaneSafetyError:
                            owner_canary_state = "invalid"
                        else:
                            owner_canary_state = "canonical"
                    try:
                        pending_owner_stat = os.stat(
                            _owner_temp_name(owner_token),
                            dir_fd=lane_fd,
                            follow_symlinks=False,
                        )
                    except FileNotFoundError:
                        pending_owner_state = "absent"
                    else:
                        if (
                            _is_link_or_reparse(pending_owner_stat)
                            or not stat.S_ISREG(pending_owner_stat.st_mode)
                            or stat.S_IMODE(pending_owner_stat.st_mode) & 0o111
                        ):
                            pending_owner_state = "unsafe"
                        else:
                            try:
                                pending_owner_payload = _read_bounded_regular_payload(
                                    _owner_temp_name(owner_token),
                                    dir_fd=lane_fd,
                                    label="QA lane pending owner canary",
                                )
                            except (LaneSafetyError, OSError):
                                pending_owner_state = "invalid"
                            else:
                                pending_owner_state = "regular"
                                pending_owner_payload_sha256 = hashlib.sha256(
                                    pending_owner_payload
                                ).hexdigest()
                finally:
                    os.close(lane_fd)
        if lane_root_state in ("absent", "directory"):
            lane_inventory = inventory_tree(
                lane_root,
                authority_root=data_base,
                authority_fd=data_base_fd,
            )
            lane_inventory_sha256 = str(lane_inventory["sha256"])
            lane_entry_count = int(lane_inventory["entryCount"])
        else:
            lane_inventory_sha256 = ""
            lane_entry_count = -1
        real_inventory = inventory_tree(
            real_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        report = {
            "status": "inspected",
            "lane": lane,
            "owner": owner_token,
            "feature": paths.feature,
            "laneRoot": str(lane_root),
            "realRoot": str(real_root),
            "pendingLockState": pending_state,
            "pendingLockPayloadSha256": pending_payload_sha256,
            "pendingLockedRealInventorySha256": pending_locked_real_sha256,
            "publishedLockState": published_lock_state,
            "lockedRealInventorySha256": locked_real_sha256,
            "laneRootState": lane_root_state,
            "ownerCanaryState": owner_canary_state,
            "pendingOwnerState": pending_owner_state,
            "pendingOwnerPayloadSha256": pending_owner_payload_sha256,
            "laneInventorySha256": lane_inventory_sha256,
            "laneEntryCount": lane_entry_count,
            "realInventorySha256": real_inventory["sha256"],
            "realEntryCount": real_inventory["entryCount"],
        }
        return {**report, "inspectionSha256": _inspection_sha256(report)}
    finally:
        os.close(data_base_fd)


def recover_lane(
    lane: str,
    owner: str,
    inspection_sha256: str,
    confirm_no_processes: str,
) -> dict[str, object]:
    _require_posix_lane_lifecycle()
    if confirm_no_processes != RECOVERY_NO_PROCESS_CONFIRMATION:
        raise LaneSafetyError("manual recovery requires an explicit external no-runner/Godot process confirmation")
    if not re.fullmatch(r"[0-9a-f]{64}", str(inspection_sha256)):
        raise LaneSafetyError("manual recovery requires the exact prior inspection SHA-256")
    inspected = inspect_lane(lane, owner)
    if inspected["inspectionSha256"] != inspection_sha256:
        raise LaneSafetyError("QA lane state changed after inspection; recovery refused")
    paths, data_base, lane_root, real_root = _canonical_current_paths(lane)
    owner_token = _validated_owner_token(owner)
    data_base_fd, _data_base_stat = _open_current_data_base(data_base)
    try:
        try:
            expected_real_sha256 = _read_recoverable_lock(
                data_base,
                lane,
                owner_token,
                data_base_fd=data_base_fd,
            )
        except FileNotFoundError:
            try:
                os.stat(lane_root.name, dir_fd=data_base_fd, follow_symlinks=False)
            except FileNotFoundError:
                lane_exists = False
            else:
                lane_exists = True
            if lane_exists:
                raise LaneSafetyError("QA lane exists without its external owner lock; recovery refused")
            if inspected["pendingLockState"] in ("unsafe", "invalid"):
                raise LaneSafetyError("unsafe or foreign pending lock residue requires manual filesystem inspection")
            if inspected["pendingLockState"] == "canonical":
                pending_real_inventory = inventory_tree(
                    real_root,
                    authority_root=data_base,
                    authority_fd=data_base_fd,
                )
                if (
                    pending_real_inventory["sha256"]
                    != inspected["pendingLockedRealInventorySha256"]
                ):
                    raise LaneSafetyError(
                        "real Godot user-data root changed before pending-lock recovery"
                    )
            _remove_pending_lock(
                data_base,
                lane,
                owner_token,
                data_base_fd=data_base_fd,
                expected_payload_sha256=str(inspected["pendingLockPayloadSha256"]),
            )
            return {
                "status": "absent",
                "lane": lane,
                "owner": owner_token,
                "laneAbsent": True,
            }
        if expected_real_sha256 != inspected["lockedRealInventorySha256"]:
            raise LaneSafetyError("published lock authority changed after inspection; recovery refused")
        real_before_recovery = inventory_tree(
            real_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        if real_before_recovery["sha256"] != expected_real_sha256:
            raise LaneSafetyError("real Godot user-data root changed before manual recovery; authority preserved")
        _remove_pending_lock(
            data_base,
            lane,
            owner_token,
            data_base_fd=data_base_fd,
            expected_payload_sha256=str(inspected["pendingLockPayloadSha256"]),
        )
        if inspected["laneRootState"] == "absent":
            pass
        elif inspected["laneRootState"] != "directory":
            raise LaneSafetyError("unsafe QA lane root cannot be recovered")
        elif inspected["ownerCanaryState"] == "canonical":
            _remove_pending_owner(
                lane_root,
                lane,
                owner_token,
                authority_root=data_base,
                authority_fd=data_base_fd,
                expected_payload_sha256=str(inspected["pendingOwnerPayloadSha256"]),
                allow_incomplete_unpublished=False,
            )
            _remove_tree_no_follow(
                lane_root,
                lane,
                owner_token,
                authority_root=data_base,
                authority_fd=data_base_fd,
            )
        elif inspected["ownerCanaryState"] == "absent":
            if inspected["pendingOwnerState"] in ("unsafe", "invalid"):
                raise LaneSafetyError("unsafe pending owner residue requires manual filesystem inspection")
            if inspected["pendingOwnerState"] == "regular":
                _remove_pending_owner(
                    lane_root,
                    lane,
                    owner_token,
                    authority_root=data_base,
                    authority_fd=data_base_fd,
                    expected_payload_sha256=str(inspected["pendingOwnerPayloadSha256"]),
                    allow_incomplete_unpublished=True,
                )
            _remove_incomplete_lane_for_recovery(
                data_base,
                lane_root,
                data_base_fd=data_base_fd,
            )
        else:
            raise LaneSafetyError("invalid owner canary cannot be recovered from an atomic publish contract")
        real_before_lock_removal = inventory_tree(
            real_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        if real_before_lock_removal["sha256"] != expected_real_sha256:
            raise LaneSafetyError("real Godot user-data root changed during manual recovery; external lock preserved")
        _remove_lock_exact(
            data_base,
            lane,
            owner_token,
            data_base_fd=data_base_fd,
        )
        real_inventory = inventory_tree(
            real_root,
            authority_root=data_base,
            authority_fd=data_base_fd,
        )
        real_unchanged = real_inventory["sha256"] == expected_real_sha256
        if not real_unchanged:
            raise LaneSafetyError("real Godot user-data root changed during ambiguous prepare recovery")
        return {
            "status": "recovered",
            "lane": lane,
            "owner": owner_token,
            "laneAbsent": True,
            "realRoot": str(real_root),
            "realInventorySha256": real_inventory["sha256"],
            "realUnchanged": True,
        }
    finally:
        os.close(data_base_fd)


def _project_contract_lines() -> list[str]:
    lines: list[str] = []
    for record in LANES.values():
        feature = record["feature"]
        custom_name = record["customUserDirName"]
        lines.extend([
            f"config/use_custom_user_dir.{feature}=true",
            f'config/custom_user_dir_name.{feature}="{custom_name}"',
        ])
    return lines


def _validate_helper_function_contract(helper_text: str) -> None:
    try:
        module = ast.parse(helper_text)
    except SyntaxError as error:
        raise LaneSafetyError(f"QA lane helper does not parse: {error}") from error
    source_lines = helper_text.splitlines(keepends=True)
    if (
        not module.body
        or not isinstance(module.body[0], ast.Expr)
        or not isinstance(module.body[0].value, ast.Constant)
        or not isinstance(module.body[0].value.value, str)
    ):
        raise LaneSafetyError("QA lane helper must begin with one module docstring")
    expected_import_sources = (
        "from __future__ import annotations\n",
        "import argparse\n",
        "import ast\n",
        "import hashlib\n",
        "import json\n",
        "import ntpath\n",
        "import os\n",
        "import posixpath\n",
        "import re\n",
        "import stat\n",
        "import sys\n",
        "from dataclasses import dataclass\n",
        "from pathlib import Path\n",
        "from typing import Iterable, Mapping\n",
    )
    expected_assignment_names = (
        "OWNER_CANARY_NAME",
        "LOCK_CANARY_PREFIX",
        "EDITOR_CUSTOM_FEATURES_ENV",
        "REAL_PROJECT_DIR_NAME",
        "RECOVERY_NO_PROCESS_CONFIRMATION",
        "FEATURE_TOKEN_PATTERN",
        "POSIX_DIR_FD_FUNCTIONS",
        "POSIX_NOFOLLOW_FUNCTIONS",
        "LANES",
        "RESERVED_FEATURES",
        "RUNNER_SOURCE_SHA256",
        "HELPER_CONTRACT_FUNCTION_SHA256",
        "MAIN_CONTRACT_FUNCTION_SHA256",
        "RUNNER_CONTRACT_FUNCTION_SHA256",
        "AUTO_CHECK_CONTRACT_FUNCTION_SHA256",
    )
    cursor = 1
    imports: list[str] = []
    while cursor < len(module.body) and isinstance(module.body[cursor], (ast.Import, ast.ImportFrom)):
        import_node = module.body[cursor]
        imports.append(
            "".join(source_lines[import_node.lineno - 1:import_node.end_lineno])
            .replace("\r\n", "\n")
            .rstrip()
            + "\n"
        )
        cursor += 1
    if tuple(imports) != expected_import_sources:
        raise LaneSafetyError("QA lane helper top-level imports changed")
    assignment_names: list[str] = []
    while cursor < len(module.body) and isinstance(module.body[cursor], (ast.Assign, ast.AnnAssign)):
        assignment_node = module.body[cursor]
        if isinstance(assignment_node, ast.Assign):
            if len(assignment_node.targets) != 1 or not isinstance(assignment_node.targets[0], ast.Name):
                raise LaneSafetyError("QA lane helper top-level assignment target is not an exact name")
            assignment_names.append(assignment_node.targets[0].id)
        else:
            if not isinstance(assignment_node.target, ast.Name):
                raise LaneSafetyError("QA lane helper annotated assignment target is not an exact name")
            assignment_names.append(assignment_node.target.id)
        cursor += 1
    if tuple(assignment_names) != expected_assignment_names:
        raise LaneSafetyError("QA lane helper top-level assignment structure changed")
    class_nodes: list[ast.ClassDef] = []
    while cursor < len(module.body) and isinstance(module.body[cursor], ast.ClassDef):
        class_nodes.append(module.body[cursor])
        cursor += 1
    if [node.name for node in class_nodes] != ["LaneSafetyError", "LanePaths"]:
        raise LaneSafetyError("QA lane helper top-level class structure changed")
    if class_nodes[0].decorator_list:
        raise LaneSafetyError("decorated QA lane helper LaneSafetyError class is forbidden")
    lane_paths_decorators = class_nodes[1].decorator_list
    if (
        len(lane_paths_decorators) != 1
        or ast.get_source_segment(helper_text, lane_paths_decorators[0]) != "dataclass(frozen=True)"
    ):
        raise LaneSafetyError("QA lane helper LanePaths decorator contract changed")
    lane_safety_source = (
        "".join(source_lines[class_nodes[0].lineno - 1:class_nodes[0].end_lineno])
        .replace("\r\n", "\n")
        .rstrip()
        + "\n"
    )
    if lane_safety_source != (
        "class LaneSafetyError(RuntimeError):\n"
        '    """Raised when a lane cannot be proven safe to inspect or remove."""\n'
    ):
        raise LaneSafetyError("QA lane helper LaneSafetyError class contract changed")
    functions: dict[str, ast.FunctionDef | ast.AsyncFunctionDef] = {}
    while cursor < len(module.body) and isinstance(module.body[cursor], (ast.FunctionDef, ast.AsyncFunctionDef)):
        node = module.body[cursor]
        if node.name in functions:
            raise LaneSafetyError(f"duplicate QA lane helper function: {node.name}")
        if node.decorator_list:
            raise LaneSafetyError(f"decorated QA lane helper function is forbidden: {node.name}")
        functions[node.name] = node
        cursor += 1
    if len(module.body) - cursor != 1 or not isinstance(module.body[cursor], ast.If):
        raise LaneSafetyError("QA lane helper must end with one exact main guard")
    main_guard = module.body[cursor]
    main_guard_source = (
        "".join(source_lines[main_guard.lineno - 1:main_guard.end_lineno])
        .replace("\r\n", "\n")
        .rstrip()
        + "\n"
    )
    if main_guard_source != (
        'if __name__ == "__main__":\n'
        "    raise SystemExit(main())\n"
    ):
        raise LaneSafetyError("QA lane helper main guard contract changed")
    if set(functions) != set(HELPER_CONTRACT_FUNCTION_SHA256):
        missing = sorted(set(HELPER_CONTRACT_FUNCTION_SHA256) - set(functions))
        unpinned = sorted(set(functions) - set(HELPER_CONTRACT_FUNCTION_SHA256))
        raise LaneSafetyError(
            f"QA lane helper function keyset changed: missing={missing} unpinned={unpinned}"
        )
    for name, expected_sha256 in HELPER_CONTRACT_FUNCTION_SHA256.items():
        if name not in functions:
            raise LaneSafetyError(f"QA lane helper function missing: {name}")
        node = functions[name]
        function_text = "".join(source_lines[node.lineno - 1:node.end_lineno])
        canonical = function_text.replace("\r\n", "\n").rstrip() + "\n"
        actual_sha256 = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        if actual_sha256 != expected_sha256:
            raise LaneSafetyError(
                f"QA lane helper function contract changed: {name} expected={expected_sha256} actual={actual_sha256}"
            )


def _top_level_assignment_sources(source_text: str) -> dict[str, str]:
    module = ast.parse(source_text)
    source_lines = source_text.splitlines(keepends=True)
    assignments: dict[str, str] = {}
    for node in module.body:
        target: ast.expr | None = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
        elif isinstance(node, ast.AnnAssign):
            target = node.target
        if not isinstance(target, ast.Name):
            continue
        assignments[target.id] = (
            "".join(source_lines[node.lineno - 1:node.end_lineno])
            .replace("\r\n", "\n")
            .rstrip()
            + "\n"
        )
    return assignments


def _validate_helper_constant_contract(helper_text: str) -> None:
    assignments = _top_level_assignment_sources(helper_text)
    expected = {
        "OWNER_CANARY_NAME": 'OWNER_CANARY_NAME = ".beastbound_qa_lane_owner.json"\n',
        "LOCK_CANARY_PREFIX": 'LOCK_CANARY_PREFIX = ".beastbound_qa_lane_lock_"\n',
        "EDITOR_CUSTOM_FEATURES_ENV": 'EDITOR_CUSTOM_FEATURES_ENV = "GODOT_EDITOR_CUSTOM_FEATURES"\n',
        "REAL_PROJECT_DIR_NAME": 'REAL_PROJECT_DIR_NAME = "Beastbound Odyssey - 万兽纪元"\n',
        "RECOVERY_NO_PROCESS_CONFIRMATION": (
            'RECOVERY_NO_PROCESS_CONFIRMATION = "I_CONFIRMED_NO_GODOT_OR_QA_PROCESSES"\n'
        ),
        "FEATURE_TOKEN_PATTERN": 'FEATURE_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")\n',
        "POSIX_DIR_FD_FUNCTIONS": (
            "POSIX_DIR_FD_FUNCTIONS = (\n"
            '    ("open", os.open),\n'
            '    ("stat", os.stat),\n'
            '    ("mkdir", os.mkdir),\n'
            '    ("unlink", os.unlink),\n'
            '    ("rmdir", os.rmdir),\n'
            '    ("link", os.link),\n'
            ")\n"
        ),
        "POSIX_NOFOLLOW_FUNCTIONS": (
            'POSIX_NOFOLLOW_FUNCTIONS = (("stat", os.stat), ("link", os.link))\n'
        ),
        "LANES": (
            "LANES = {\n"
            '    "automation": {\n'
            '        "feature": "beastbound_qa_automation",\n'
            '        "customUserDirName": "BeastboundOdysseyQA_Automation",\n'
            "    },\n"
            '    "client1": {\n'
            '        "feature": "beastbound_qa_client1",\n'
            '        "customUserDirName": "BeastboundOdysseyQA_Client1",\n'
            "    },\n"
            '    "client2": {\n'
            '        "feature": "beastbound_qa_client2",\n'
            '        "customUserDirName": "BeastboundOdysseyQA_Client2",\n'
            "    },\n"
            "}\n"
        ),
        "RESERVED_FEATURES": (
            'RESERVED_FEATURES = frozenset(record["feature"] for record in LANES.values())\n'
        ),
        "RUNNER_SOURCE_SHA256": (
            'RUNNER_SOURCE_SHA256 = "88af3f9c2e66820bb4a51ab8311a113c2a7fd410055dad7e9fd27881bb5181bc"\n'
        ),
    }
    for name, expected_source in expected.items():
        if assignments.get(name) != expected_source:
            raise LaneSafetyError(f"QA lane helper critical constant changed: {name}")
    module = ast.parse(helper_text)
    lane_paths_classes = [
        node for node in module.body if isinstance(node, ast.ClassDef) and node.name == "LanePaths"
    ]
    if len(lane_paths_classes) != 1:
        raise LaneSafetyError("QA lane helper must define one exact LanePaths class")
    lane_paths_class = lane_paths_classes[0]
    source_lines = helper_text.splitlines(keepends=True)
    start_line = min(
        [lane_paths_class.lineno]
        + [decorator.lineno for decorator in lane_paths_class.decorator_list]
    )
    actual_lane_paths_source = (
        "".join(source_lines[start_line - 1:lane_paths_class.end_lineno])
        .replace("\r\n", "\n")
        .rstrip()
        + "\n"
    )
    expected_lane_paths_source = (
        "@dataclass(frozen=True)\n"
        "class LanePaths:\n"
        "    lane: str\n"
        "    feature: str\n"
        "    custom_user_dir_name: str\n"
        "    data_base: str\n"
        "    lane_root: str\n"
        "    real_root: str\n"
        "\n"
        "    @property\n"
        "    def godot_lane_root(self) -> str:\n"
        "        return self.lane_root.replace(\"\\\\\", \"/\").rstrip(\"/\")\n"
        "\n"
        "    @property\n"
        "    def godot_real_root(self) -> str:\n"
        "        return self.real_root.replace(\"\\\\\", \"/\").rstrip(\"/\")\n"
    )
    if actual_lane_paths_source != expected_lane_paths_source:
        raise LaneSafetyError("QA lane helper LanePaths class contract changed")


def _raw_named_function_sources(source_text: str, language: str) -> dict[str, str]:
    if language == "gdscript":
        pattern = re.compile(r"(?m)^func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(")
    elif language == "javascript":
        pattern = re.compile(r"(?m)^(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(")
    else:
        raise LaneSafetyError(f"unknown source-contract language: {language}")
    matches = list(pattern.finditer(source_text))
    functions: dict[str, str] = {}
    for index, match in enumerate(matches):
        name = match.group(1)
        if name in functions:
            raise LaneSafetyError(f"duplicate {language} contract function: {name}")
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source_text)
        functions[name] = source_text[match.start():end].replace("\r\n", "\n").rstrip() + "\n"
    return functions


def _validate_named_function_contract(
    source_text: str,
    language: str,
    expected: Mapping[str, str],
    *,
    exact_keyset: bool = False,
) -> None:
    functions = _raw_named_function_sources(source_text, language)
    if exact_keyset and set(functions) != set(expected):
        missing = sorted(set(expected) - set(functions))
        unpinned = sorted(set(functions) - set(expected))
        raise LaneSafetyError(
            f"{language} function keyset changed: missing={missing} unpinned={unpinned}"
        )
    for name, expected_sha256 in expected.items():
        if name not in functions:
            raise LaneSafetyError(f"{language} contract function missing: {name}")
        actual_sha256 = hashlib.sha256(functions[name].encode("utf-8")).hexdigest()
        if actual_sha256 != expected_sha256:
            raise LaneSafetyError(
                f"{language} function contract changed: {name} expected={expected_sha256} actual={actual_sha256}"
            )


def validate_repository_sources(
    project_text: str,
    main_text: str,
    runner_text: str,
    helper_text: str | None = None,
    auto_check_text: str | None = None,
) -> None:
    """Reject accidental Slice A source drift, not malicious same-UID synchronized rewrites."""

    if helper_text is not None:
        _validate_helper_constant_contract(helper_text)
        _validate_helper_function_contract(helper_text)
    _validate_named_function_contract(main_text, "gdscript", MAIN_CONTRACT_FUNCTION_SHA256)
    actual_runner_sha256 = hashlib.sha256(runner_text.encode("utf-8")).hexdigest()
    if actual_runner_sha256 != RUNNER_SOURCE_SHA256:
        raise LaneSafetyError(
            "JavaScript runner whole-source contract changed: "
            f"expected={RUNNER_SOURCE_SHA256} actual={actual_runner_sha256}"
        )
    _validate_named_function_contract(
        runner_text,
        "javascript",
        RUNNER_CONTRACT_FUNCTION_SHA256,
        exact_keyset=True,
    )
    if auto_check_text is not None:
        _validate_named_function_contract(
            auto_check_text,
            "gdscript",
            AUTO_CHECK_CONTRACT_FUNCTION_SHA256,
        )
    for line in _project_contract_lines():
        if project_text.count(line) != 1:
            raise LaneSafetyError(f"project feature override missing or duplicated: {line}")
    actual_user_dir_lines = [
        line.strip()
        for line in project_text.splitlines()
        if line.strip().startswith("config/use_custom_user_dir")
        or line.strip().startswith("config/custom_user_dir_name")
    ]
    if actual_user_dir_lines != _project_contract_lines():
        raise LaneSafetyError("project user-data settings must be exactly the three feature-scoped lane overrides")
    actual_base_feature_lines = [
        line.strip()
        for line in project_text.splitlines()
        if line.strip().startswith("config/features=")
    ]
    if actual_base_feature_lines != ['config/features=PackedStringArray("4.7", "Mobile")']:
        raise LaneSafetyError("project base features must not activate a reserved QA user-data lane")
    forbidden_main = (
        "--user-data-dir",
        "STARTUP_LOGIN_ISOLATION_ARG",
        "STARTUP_LOGIN_ISOLATION_ROOT",
        "_restart_with_startup_login_user_data_dir_if_needed",
        "_startup_login_user_data_dir",
        "_startup_login_relaunch_engine_args",
        "OS.create_process",
    )
    for fragment in forbidden_main:
        if fragment in main_text:
            raise LaneSafetyError(f"obsolete startup-login relaunch remains in Main: {fragment}")
    main_lines = main_text.splitlines(keepends=True)
    main_lane_constant_contract = {
        "QA_USER_DATA_LANE_ARG_PREFIX": (
            'const QA_USER_DATA_LANE_ARG_PREFIX := "--beastbound-qa-user-data-lane="\n'
        ),
        "QA_USER_DATA_LANE_ENV": (
            'const QA_USER_DATA_LANE_ENV := "BEASTBOUND_QA_USER_DATA_LANE"\n'
        ),
        "QA_USER_DATA_ROOT_ENV": (
            'const QA_USER_DATA_ROOT_ENV := "BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT"\n'
        ),
        "QA_USER_DATA_ATTESTATION_PREFIX": (
            'const QA_USER_DATA_ATTESTATION_PREFIX := "BEASTBOUND_QA_USER_DATA_ATTESTATION: "\n'
        ),
        "QA_USER_DATA_LANES": (
            "const QA_USER_DATA_LANES := {\n"
            '\t"automation": {\n'
            '\t\t"feature": "beastbound_qa_automation",\n'
            '\t\t"customUserDirName": "BeastboundOdysseyQA_Automation",\n'
            "\t},\n"
            '\t"client1": {\n'
            '\t\t"feature": "beastbound_qa_client1",\n'
            '\t\t"customUserDirName": "BeastboundOdysseyQA_Client1",\n'
            "\t},\n"
            '\t"client2": {\n'
            '\t\t"feature": "beastbound_qa_client2",\n'
            '\t\t"customUserDirName": "BeastboundOdysseyQA_Client2",\n'
            "\t},\n"
            "}\n"
        ),
    }
    for constant_name, expected_source in main_lane_constant_contract.items():
        matching_indices = [
            index
            for index, line in enumerate(main_lines)
            if line.startswith(f"const {constant_name} ")
        ]
        if len(matching_indices) != 1:
            raise LaneSafetyError(
                f"Main QA lane constant must have one top-level assignment: {constant_name}"
            )
        start_index = matching_indices[0]
        if constant_name == "QA_USER_DATA_LANES":
            end_index = start_index
            while end_index < len(main_lines) and main_lines[end_index] != "}\n":
                end_index += 1
            if end_index >= len(main_lines):
                raise LaneSafetyError("Main QA lane dictionary is not terminated")
            actual_source = "".join(main_lines[start_index:end_index + 1])
        else:
            actual_source = main_lines[start_index]
        if actual_source != expected_source:
            raise LaneSafetyError(f"Main QA lane constant changed: {constant_name}")
    main_pet_codex_top_level_contract = {
        "PetCodexAwakenedOwnerReviewCapture": (
            "const PetCodexAwakenedOwnerReviewCapture := preload(\n"
            '\t"res://scripts/qa/pet_codex_awakened_owner_review_capture.gd"\n'
            ")\n"
        ),
        "pet_codex_awakened_owner_review_capture": (
            "var pet_codex_awakened_owner_review_capture: bool = false\n"
        ),
        "pet_codex_awakened_owner_review_capture_arg_count": (
            "var pet_codex_awakened_owner_review_capture_arg_count: int = 0\n"
        ),
        "pet_codex_awakened_owner_review_native_perf_arg_count": (
            "var pet_codex_awakened_owner_review_native_perf_arg_count: int = 0\n"
        ),
        "pet_codex_awakened_owner_review_parse_error": (
            'var pet_codex_awakened_owner_review_parse_error: String = ""\n'
        ),
    }
    main_battle_layout_top_level_contract = {
        "BattleLayoutOwnerReviewCapture": (
            "const BattleLayoutOwnerReviewCapture := preload(\n"
            '\t"res://scripts/qa/battle_layout_owner_review_capture.gd"\n'
            ")\n"
        ),
        "battle_layout_owner_review_capture": (
            "var battle_layout_owner_review_capture: bool = false\n"
        ),
        "battle_layout_owner_review_capture_arg_count": (
            "var battle_layout_owner_review_capture_arg_count: int = 0\n"
        ),
        "battle_layout_perf_arg_count": (
            "var battle_layout_perf_arg_count: int = 0\n"
        ),
        "battle_layout_owner_review_parse_error": (
            'var battle_layout_owner_review_parse_error: String = ""\n'
        ),
    }
    for label, contract, preload_name in (
        (
            "pet-codex",
            main_pet_codex_top_level_contract,
            "PetCodexAwakenedOwnerReviewCapture",
        ),
        (
            "Phase403 battle-layout",
            main_battle_layout_top_level_contract,
            "BattleLayoutOwnerReviewCapture",
        ),
    ):
        for binding_name, expected_source in contract.items():
            binding_prefix = (
                f"const {binding_name} "
                if binding_name == preload_name
                else f"var {binding_name}:"
            )
            matching_indices = [
                index
                for index, line in enumerate(main_lines)
                if line.startswith(binding_prefix)
            ]
            if len(matching_indices) != 1:
                raise LaneSafetyError(
                    f"Main {label} host binding must be unique: {binding_name}"
                )
            start_index = matching_indices[0]
            if binding_name == preload_name:
                end_index = start_index
                while end_index < len(main_lines) and main_lines[end_index] != ")\n":
                    end_index += 1
                if end_index >= len(main_lines):
                    raise LaneSafetyError(f"Main {label} preload is not terminated")
                actual_source = "".join(main_lines[start_index:end_index + 1])
            else:
                actual_source = main_lines[start_index]
            if actual_source != expected_source:
                raise LaneSafetyError(
                    f"Main {label} host binding changed: {binding_name}"
                )
    main_phase404_top_level_contract = {
        "PetBattleReleaseGate": (
            'const PetBattleReleaseGate := preload("res://scripts/pet/pet_battle_release_gate.gd")\n'
        ),
        "PET_BATTLE_USER_ROOT_PREFLIGHT_ENV": (
            'const PET_BATTLE_USER_ROOT_PREFLIGHT_ENV := "BEASTBOUND_PET_BATTLE_USER_ROOT_PREFLIGHT"\n'
        ),
        "PET_BATTLE_USER_ROOT_PREFLIGHT_PREFIX": (
            'const PET_BATTLE_USER_ROOT_PREFLIGHT_PREFIX := "pet battle user root preflight: "\n'
        ),
        "PET_BATTLE_REPO_ROOT_ENV": (
            'const PET_BATTLE_REPO_ROOT_ENV := "BEASTBOUND_PET_BATTLE_REPO_ROOT"\n'
        ),
        "PET_BATTLE_REPO_ROOT_SHA256_ENV": (
            'const PET_BATTLE_REPO_ROOT_SHA256_ENV := "BEASTBOUND_PET_BATTLE_REPO_ROOT_SHA256"\n'
        ),
    }
    for binding_name, expected_source in main_phase404_top_level_contract.items():
        matching_lines = [
            line for line in main_lines if line.startswith(f"const {binding_name} ")
        ]
        if matching_lines != [expected_source]:
            raise LaneSafetyError(
                f"Main Phase404 pet release binding changed: {binding_name}"
            )
    main_required = (
        "func _attest_qa_user_data_lane_or_exit() -> bool:",
        "var qa_user_data_lane_arg_count: int = 0",
        "var qa_entrypoint_requires_lane: bool = false",
        "OS.get_environment(QA_USER_DATA_LANE_ENV)",
        "OS.get_environment(QA_USER_DATA_ROOT_ENV)",
        "OS.has_feature(expected_feature)",
        'ProjectSettings.globalize_path("user://")',
        'ProjectSettings.get_setting_with_override("application/config/use_custom_user_dir")',
        'ProjectSettings.get_setting_with_override("application/config/custom_user_dir_name")',
        "get_tree().quit(2)",
        "QA_USER_DATA_ATTESTATION_PREFIX",
    )
    for fragment in main_required:
        if fragment not in main_text:
            raise LaneSafetyError(f"Main QA lane attestation contract missing: {fragment}")
    if main_text.count('ProjectSettings.globalize_path("user://")') != 4:
        raise LaneSafetyError(
            "Main must bind the actual user-data root in lane failure/success, Phase404 preflight, and PCK result paths"
        )
    ready_start = main_text.index("func _ready() -> void:")
    ready_end = main_text.index("\nfunc ", ready_start + 1)
    ready_slice = main_text[ready_start:ready_end]
    ordered_ready = (
        "set_process(false)",
        "_apply_preview_window_args()",
        "if not _attest_qa_user_data_lane_or_exit():",
        'if pet_codex_awakened_owner_review_parse_error != "":',
        'if battle_layout_owner_review_parse_error != "":',
        "if _run_pet_battle_user_root_preflight_if_requested():",
        "PetBattleReleaseGate.initialize()",
        "_configure_runtime_performance()",
        "_bootstrap_auth_state()",
        "_build_game_audio_manager()",
        "_build_hud()",
        'call_deferred("_run_pet_codex_awakened_owner_review_capture")',
        'call_deferred("_run_battle_layout_owner_review_capture")',
    )
    positions = [ready_slice.find(fragment) for fragment in ordered_ready]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        raise LaneSafetyError(
            "Main must attest the lane, reject capture args, run the Phase404 preflight, initialize the release gate, then bootstrap and dispatch"
        )
    attestation_start = main_text.index("func _attest_qa_user_data_lane_or_exit() -> bool:")
    attestation_end = main_text.index("\nfunc ", attestation_start + 1)
    attestation_slice = main_text[attestation_start:attestation_end]
    for fragment in (
        "if lane_markers_absent:",
        "if startup_auth_login_arg_present or auto_startup_login_check:",
        'return _reject_qa_user_data_lane("startup_login_requires_lane")',
        "if qa_entrypoint_requires_lane:",
        'return _reject_qa_user_data_lane("qa_entrypoint_requires_lane")',
        "if qa_user_data_lane_arg_count != 1:",
        'return _reject_qa_user_data_lane("lane_argument_count_mismatch",',
        "if not QA_USER_DATA_LANES.has(cli_lane):",
        'return _reject_qa_user_data_lane("unknown_lane")',
        "if not OS.has_feature(expected_feature):",
        'return _reject_qa_user_data_lane("missing_feature")',
        "if actual_root != expected_root:",
        'return _reject_qa_user_data_lane("user_data_root_mismatch",',
    ):
        if fragment not in attestation_slice:
            raise LaneSafetyError(f"Main fail-closed attestation branch missing: {fragment}")
    dev_entrypoint_start = main_text.index("func _dev_entrypoint_arg(arg: String) -> bool:")
    dev_entrypoint_end = main_text.index("\nfunc ", dev_entrypoint_start + 1)
    dev_entrypoint_slice = main_text[dev_entrypoint_start:dev_entrypoint_end]
    for fragment, label in (
        ('normalized == "--local-world-move"', "local-world movement"),
        ("normalized.begins_with(QA_USER_DATA_LANE_ARG_PREFIX)", "lane marker"),
        ("PetCodexAwakenedOwnerReviewCapture.is_flag(normalized)", "pet-codex"),
        ("BattleLayoutOwnerReviewCapture.is_flag(normalized)", "battle-layout"),
    ):
        if dev_entrypoint_slice.count(fragment) != 1:
            raise LaneSafetyError(f"Main {label} QA entrypoint contract changed")
    if '"--server-url"' in dev_entrypoint_slice or '"--auth-server-url"' in dev_entrypoint_slice:
        raise LaneSafetyError("server URL configuration alone must remain an ordinary no-lane path")
    apply_start = main_text.index("func _apply_preview_window_args() -> void:")
    apply_end = main_text.index("\nfunc ", apply_start + 1)
    apply_slice = main_text[apply_start:apply_end]
    common_apply_fragments = (
        "startup_auth_login_arg_present = false",
        "qa_entrypoint_requires_lane = false",
        'qa_user_data_lane_arg = ""',
        "qa_user_data_lane_arg_count = 0",
        "if _startup_auth_cli_arg(arg):",
        "startup_auth_login_arg_present = true",
        "if _dev_entrypoint_arg(arg) and not arg.begins_with(QA_USER_DATA_LANE_ARG_PREFIX):",
        "qa_entrypoint_requires_lane = true",
        'if arg != "--auto-auth-check" and arg != "--auto-auth-server-live-check" and arg != "--auto-startup-login-check" and arg != "--auto-character-entry-live-check" and not arg.begins_with("--map-art-review-preview") and not arg.begins_with(QA_USER_DATA_LANE_ARG_PREFIX):',
        "elif arg.begins_with(QA_USER_DATA_LANE_ARG_PREFIX):",
        "qa_user_data_lane_arg_count += 1",
        "qa_user_data_lane_arg = arg.substr(QA_USER_DATA_LANE_ARG_PREFIX.length()).strip_edges()",
    )
    for fragment in common_apply_fragments:
        if apply_slice.count(fragment) != 1:
            raise LaneSafetyError(
                f"Main QA lane argument contract changed: {fragment}"
            )
    pet_fragments = (
        "pet_codex_awakened_owner_review_capture = false",
        "pet_codex_awakened_owner_review_capture_arg_count = 0",
        "pet_codex_awakened_owner_review_native_perf_arg_count = 0",
        'pet_codex_awakened_owner_review_parse_error = ""',
        "elif arg == PetCodexAwakenedOwnerReviewCapture.CAPTURE_FLAG:",
        "pet_codex_awakened_owner_review_capture = true",
        "pet_codex_awakened_owner_review_capture_arg_count += 1",
        "elif arg == PetCodexAwakenedOwnerReviewCapture.NATIVE_PERF_FLAG:",
        "pet_codex_awakened_owner_review_native_perf_arg_count += 1",
        "if pet_codex_awakened_owner_review_capture_arg_count != 1:",
        "elif pet_codex_awakened_owner_review_native_perf_arg_count > 1:",
    )
    battle_fragments = (
        "battle_layout_owner_review_capture = false",
        "battle_layout_owner_review_capture_arg_count = 0",
        "battle_layout_perf_arg_count = 0",
        'battle_layout_owner_review_parse_error = ""',
        "if battle_layout_owner_review_capture_arg_count != 1:",
        "elif battle_layout_perf_arg_count > 1:",
    )
    for label, fragments in (
        ("pet-codex", pet_fragments),
        ("Phase403 battle-layout", battle_fragments),
    ):
        for fragment in fragments:
            if apply_slice.count(fragment) != 1:
                raise LaneSafetyError(
                    f"Main {label} argument contract changed: {fragment}"
                )
    capture_flag_marker = (
        "\t\telif arg == BattleLayoutOwnerReviewCapture.CAPTURE_FLAG:\n"
    )
    perf_flag_marker = (
        "\t\telif arg == BattleLayoutOwnerReviewCapture.PERF_CAPTURE_FLAG:\n"
    )
    capture_branch_start = apply_slice.find(capture_flag_marker)
    perf_branch_start = apply_slice.find(perf_flag_marker)
    next_branch_start = apply_slice.find("\n\t\telif ", perf_branch_start + 1)
    if not (
        capture_branch_start >= 0
        and capture_branch_start < perf_branch_start < next_branch_start
    ):
        raise LaneSafetyError("Main Phase403 battle-layout flag branches changed or reordered")
    capture_branch_slice = apply_slice[capture_branch_start:perf_branch_start]
    perf_branch_slice = apply_slice[perf_branch_start:next_branch_start]
    for branch_name, branch_slice, flag_marker, counter_fragment in (
        (
            "capture",
            capture_branch_slice,
            capture_flag_marker,
            "battle_layout_owner_review_capture_arg_count += 1",
        ),
        (
            "perf",
            perf_branch_slice,
            perf_flag_marker,
            "battle_layout_perf_arg_count += 1",
        ),
    ):
        for fragment in (
            flag_marker,
            "battle_layout_owner_review_capture = true",
            counter_fragment,
        ):
            if branch_slice.count(fragment) != 1:
                raise LaneSafetyError(
                    "Main Phase403 battle-layout "
                    f"{branch_name} flag branch changed: {fragment.strip()}"
                )
    pet_contract_start = apply_slice.index(
        "\tif (\n"
        "\t\tpet_codex_awakened_owner_review_capture_arg_count > 0\n"
        "\t\tor pet_codex_awakened_owner_review_native_perf_arg_count > 0\n"
        "\t):"
    )
    battle_contract_start = apply_slice.index(
        "\tif (\n"
        "\t\tbattle_layout_owner_review_capture_arg_count > 0\n"
        "\t\tor battle_layout_perf_arg_count > 0\n"
        "\t):"
    )
    if not pet_contract_start < battle_contract_start:
        raise LaneSafetyError("Main capture argument contracts are reordered")
    pet_contract_slice = apply_slice[pet_contract_start:battle_contract_start]
    battle_contract_slice = apply_slice[battle_contract_start:]
    for label, contract_slice in (
        ("pet-codex", pet_contract_slice),
        ("Phase403 battle-layout", battle_contract_slice),
    ):
        if contract_slice.count("auth_auto_bypass = false") != 1:
            raise LaneSafetyError(
                f"Main {label} host must disable the generic dev-GM bypass"
            )
    cross_capture_contract = (
        "\tif (\n"
        "\t\t(\n"
        "\t\t\tpet_codex_awakened_owner_review_capture_arg_count > 0\n"
        "\t\t\tor pet_codex_awakened_owner_review_native_perf_arg_count > 0\n"
        "\t\t)\n"
        "\t\tand (\n"
        "\t\t\tbattle_layout_owner_review_capture_arg_count > 0\n"
        "\t\t\tor battle_layout_perf_arg_count > 0\n"
        "\t\t)\n"
        "\t):\n"
        "\t\tvar cross_capture_error := \"图鉴验收与战斗布局验收入口不可同时启用\"\n"
        "\t\tpet_codex_awakened_owner_review_parse_error = cross_capture_error\n"
        "\t\tbattle_layout_owner_review_parse_error = cross_capture_error\n"
    )
    cross_capture_start = apply_slice.find(cross_capture_contract)
    if (
        apply_slice.count(cross_capture_contract) != 1
        or cross_capture_start <= battle_contract_start
    ):
        raise LaneSafetyError(
            "Main pet-codex and Phase403 battle-layout evidence entrypoints must be mutually exclusive"
        )
    for capture_name, label in (
        ("pet_codex_awakened_owner_review_capture", "pet-codex"),
        ("battle_layout_owner_review_capture", "Phase403 battle-layout"),
    ):
        if ready_slice.count(f"and not {capture_name}") != 1:
            raise LaneSafetyError(
                f"Main {label} host must not expose the auth panel before capture"
            )
        if ready_slice.count(f"or {capture_name}") != 1:
            raise LaneSafetyError(
                f"Main {label} host must use an isolated default profile"
            )
    for function_name, expected_source, label in (
        (
            "_run_pet_codex_awakened_owner_review_capture",
            "func _run_pet_codex_awakened_owner_review_capture() -> void:\n"
            "\tawait PetCodexAwakenedOwnerReviewCapture.new(self).run()\n\n",
            "pet-codex",
        ),
        (
            "_run_battle_layout_owner_review_capture",
            "func _run_battle_layout_owner_review_capture() -> void:\n"
            "\tawait BattleLayoutOwnerReviewCapture.new(self).run()\n\n",
            "Phase403 battle-layout",
        ),
    ):
        dispatcher_start = main_text.index(f"func {function_name}() -> void:")
        dispatcher_end = main_text.index("\nfunc ", dispatcher_start + 1)
        if main_text[dispatcher_start:dispatcher_end] != expected_source:
            raise LaneSafetyError(f"Main {label} deferred dispatcher changed")
    preflight_start = main_text.index(
        "func _run_pet_battle_user_root_preflight_if_requested() -> bool:"
    )
    preflight_end = main_text.index("\nfunc ", preflight_start + 1)
    preflight_slice = main_text[preflight_start:preflight_end]
    for fragment in (
        "OS.get_environment(PET_BATTLE_USER_ROOT_PREFLIGHT_ENV)",
        'ProjectSettings.globalize_path("res://")',
        'ProjectSettings.globalize_path("user://")',
        "OS.get_executable_path()",
        "OS.get_environment(PET_BATTLE_REPO_ROOT_ENV)",
        "OS.get_environment(PET_BATTLE_REPO_ROOT_SHA256_ENV)",
        "PET_BATTLE_USER_ROOT_PREFLIGHT_PREFIX",
        "get_tree().quit(0)",
        "return true",
    ):
        if preflight_slice.count(fragment) != 1:
            raise LaneSafetyError(
                f"Main Phase404 pet user-root preflight changed: {fragment}"
            )
    pet_action_start = main_text.index(
        "func _run_auto_pet_action_asset_check() -> void:"
    )
    pet_action_end = main_text.index("\nfunc ", pet_action_start + 1)
    pet_action_slice = main_text[pet_action_start:pet_action_end]
    for fragment in (
        'result["pckProfileSaveEnabled"] = profile_save_enabled',
        'result["pckServerAccountSession"] = _is_server_account_session()',
        'result["pckAuthAutoBypass"] = auth_auto_bypass',
        'result["pckWorkingDir"] = (',
        'result["pckUserRoot"] = ProjectSettings.globalize_path("user://")',
        'result["pckResourceRoot"] = ProjectSettings.globalize_path("res://")',
        'result["pckRepoRoot"] = OS.get_environment(PET_BATTLE_REPO_ROOT_ENV)',
        'result["pckRepoRootSha256"] = OS.get_environment(PET_BATTLE_REPO_ROOT_SHA256_ENV)',
    ):
        if pet_action_slice.count(fragment) != 1:
            raise LaneSafetyError(
                f"Main Phase404 PCK check result binding changed: {fragment}"
            )
    runner_constant_contract = {
        "MAIN_GD": 'const MAIN_GD = path.join(REPO_ROOT, "client/godot/scripts/main.gd");\n',
        "DEFAULT_OUTPUT_DIR": (
            'const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, ".run/godot_auto_checks");\n'
        ),
        "DEFAULT_PYTHON": (
            'const DEFAULT_PYTHON = process.env.BEASTBOUND_PYTHON || process.env.PYTHON_BIN || '
            '(process.platform === "win32" ? "python" : "/usr/bin/python3");\n'
        ),
        "MAX_CHECK_OUTPUT_BYTES": "const MAX_CHECK_OUTPUT_BYTES = 32 * 1024 * 1024;\n",
        "PROCESS_GROUP_CLOSE_TIMEOUT_MS": "const PROCESS_GROUP_CLOSE_TIMEOUT_MS = 10000;\n",
        "CONTAINMENT_SCOPE": (
            'const CONTAINMENT_SCOPE = "cooperative_inherited_pgid";\n'
        ),
        "PARSE_CHECK_NAME": 'const PARSE_CHECK_NAME = "godot-parse";\n',
        "QA_LANE": 'const QA_LANE = "automation";\n',
        "QA_LANE_FEATURE": 'const QA_LANE_FEATURE = "beastbound_qa_automation";\n',
        "QA_LANE_CUSTOM_USER_DIR_NAME": (
            'const QA_LANE_CUSTOM_USER_DIR_NAME = "BeastboundOdysseyQA_Automation";\n'
        ),
        "QA_LANE_ARG": 'const QA_LANE_ARG = "--beastbound-qa-user-data-lane=automation";\n',
        "QA_ATTESTATION_PREFIX": (
            'const QA_ATTESTATION_PREFIX = "BEASTBOUND_QA_USER_DATA_ATTESTATION: ";\n'
        ),
        "QA_LANE_HELPER": (
            'const QA_LANE_HELPER = path.join(REPO_ROOT, "tools/godot_qa_user_data_lane.py");\n'
        ),
    }
    runner_lines = runner_text.splitlines(keepends=True)
    for constant_name, expected_source in runner_constant_contract.items():
        matching_lines = [
            line for line in runner_lines if line.startswith(f"const {constant_name} =")
        ]
        if matching_lines != [expected_source]:
            raise LaneSafetyError(f"Godot runner QA safety constant changed: {constant_name}")
    runner_required = (
        'const QA_LANE = "automation";',
        'const QA_LANE_FEATURE = "beastbound_qa_automation";',
        'const QA_LANE_CUSTOM_USER_DIR_NAME = "BeastboundOdysseyQA_Automation";',
        'const QA_LANE_ARG = "--beastbound-qa-user-data-lane=automation";',
        'const QA_ATTESTATION_PREFIX = "BEASTBOUND_QA_USER_DATA_ATTESTATION: ";',
        'const QA_LANE_HELPER = path.join(REPO_ROOT, "tools/godot_qa_user_data_lane.py");',
        "const MAX_CHECK_OUTPUT_BYTES = 32 * 1024 * 1024;",
        "const PROCESS_GROUP_CLOSE_TIMEOUT_MS = 10000;",
        'const CONTAINMENT_SCOPE = "cooperative_inherited_pgid";',
        '"prepare"',
        '"verify"',
        '"cleanup"',
        "GODOT_EDITOR_CUSTOM_FEATURES",
        "BEASTBOUND_QA_USER_DATA_LANE",
        "BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT",
        "function parseQaLaneAttestation(output, expected) {",
        "qaLaneAttestation = parseQaLaneAttestation(output, qaLane || {});",
        "function verifyQaLane(qaLane) {",
        "verification = verifyQaLaneOrPreserve(qaLane, `post_check_${check.name}`);",
        "function cleanupQaLane(qaLane) {",
        "qaLaneCleanup = cleanupQaLane(qaLane);",
        "function terminateProcessGroup(child, signal, timeoutMs = PROCESS_GROUP_CLOSE_TIMEOUT_MS) {",
        "function processGroupClosureEvidence(value) {",
        'status: "process_group_residual_reaped"',
        'lifecycleTermSent = terminateGroup(child, "SIGTERM", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleTermSent;',
        'lifecycleKillSent = terminateGroup(child, "SIGKILL", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleKillSent;',
        'status: "process_group_residual"',
        'const handledSignals = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"];',
        "function buildRunSummary({",
        "containmentScope: CONTAINMENT_SCOPE,",
        "runnerStatus,",
        "complete,",
        "skippedCount: skipped.length,",
        "writeExclusiveFile(summaryPath,",
        "finally",
    )
    for fragment in runner_required:
        if fragment not in runner_text:
            raise LaneSafetyError(f"Godot runner QA lane contract missing: {fragment}")
    if 'runQaLaneHelper("recover"' in runner_text:
        raise LaneSafetyError("Godot runner must never auto-adopt or auto-recover an ambiguous lane")
    if runner_text.count("if (result.processGroupClosed === false || result.processGroupResidualObserved === true) {") != 1:
        raise LaneSafetyError("Godot runner must preserve any observed or uncontained process group")
    if runner_text.count("if (result.containmentBreached === true) {") != 2:
        raise LaneSafetyError(
            "Godot runner must hard-stop after both process settlement and lane verification failure"
        )
    main_runner_start = runner_text.index("async function main() {")
    main_runner_slice = runner_text[main_runner_start:]
    runner_order = (
        'const qaLaneOwner = randomBytes(16).toString("hex");',
        "writeProcessEvidence(`qa_lane_prepare_owner=${qaLaneOwner}\\n`);",
        "validateQaLaneSourceContract();",
        "qaLane = prepareQaLane(process.env, qaLaneOwner);",
        "options.outputDir = validateQaOutputDirectory(options.outputDir, qaLane);",
        "logStream = createSynchronousLog(logPath);",
        'writeLogOrThrow(logStream, `real_user_data_before_sha256=${qaLane.realInventorySha256}\\n`);',
        'qaLane.initialVerification = verifyQaLaneOrPreserve(qaLane, "initial_lane_verification");',
        "qaLane.godotPreflight = await preflightGodotEditorBinary(options.godot, qaLane);",
    )
    runner_positions = [main_runner_slice.find(fragment) for fragment in runner_order]
    if any(position < 0 for position in runner_positions) or runner_positions != sorted(runner_positions):
        raise LaneSafetyError("runner must snapshot the lane and open safe evidence before any Godot preflight")
def validate_repository_contract(repo_root: Path) -> None:
    root = Path(repo_root)
    validate_repository_sources(
        (root / "client/godot/project.godot").read_text(encoding="utf-8"),
        (root / "client/godot/scripts/main.gd").read_text(encoding="utf-8"),
        (root / "tools/run_godot_auto_checks.mjs").read_text(encoding="utf-8"),
        (root / "tools/godot_qa_user_data_lane.py").read_text(encoding="utf-8"),
        (root / "client/godot/scripts/qa/auto_check_coordinator.gd").read_text(encoding="utf-8"),
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--lane", required=True)
    prepare.add_argument("--owner", required=True)
    prepare.add_argument("--existing-features", default="")
    for name in ("verify", "cleanup"):
        command = subparsers.add_parser(name)
        command.add_argument("--lane", required=True)
        command.add_argument("--owner", required=True)
        command.add_argument("--expected-real-sha256", required=True)
    recover = subparsers.add_parser("recover")
    recover.add_argument("--lane", required=True)
    recover.add_argument("--owner", required=True)
    recover.add_argument("--inspection-sha256", required=True)
    recover.add_argument("--confirm-no-processes", required=True)
    inspect = subparsers.add_parser("inspect")
    inspect.add_argument("--lane", required=True)
    inspect.add_argument("--owner", required=True)
    source_check = subparsers.add_parser("source-check")
    source_check.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[1]))
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    args = _parser().parse_args(list(argv) if argv is not None else None)
    try:
        if args.command == "prepare":
            result = prepare_lane(args.lane, args.existing_features, args.owner)
        elif args.command == "verify":
            result = verify_lane(args.lane, args.owner, args.expected_real_sha256)
        elif args.command == "cleanup":
            result = cleanup_lane(args.lane, args.owner, args.expected_real_sha256)
        elif args.command == "recover":
            result = recover_lane(
                args.lane,
                args.owner,
                args.inspection_sha256,
                args.confirm_no_processes,
            )
        elif args.command == "inspect":
            result = inspect_lane(args.lane, args.owner)
        else:
            validate_repository_contract(Path(args.repo_root))
            result = {"status": "source_contract_passed"}
    except (LaneSafetyError, OSError) as error:
        print(json.dumps(
            {"status": "failed", "error": str(error)},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ))
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
