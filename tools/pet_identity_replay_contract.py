#!/usr/bin/env python3
"""Shared compatibility data for frozen pet identity replay digests.

Identity-gate metadata created before replay digest contract v2 hashed the
builder's absolute input path. The first two closed fusion registrations froze
those historical source/destination digests in tracked manifests. Keep the
exact values here so generic audits and the dedicated release verifier use one
compatibility authority without weakening new checkout-portable gates.

Three early portrait attestations also froze an ``action-bundle-meta.json``
file hash whose exact historical bytes were never retained.  Their remaining
identity evidence still replays byte-for-byte.  Keep the exact attested and
current metadata hashes here so the portrait auditor can accept only the
explicit, ledger-backed hash transition instead of rewriting history or
weakening every portrait to a mutable metadata snapshot.
"""

from __future__ import annotations


CLOSED_REGISTRATION_LEGACY_PATH_BOUND_REPLAY_SHA256 = {
    "emberhorn_fusion_solar_crown_fire7_wind3": (
        "afdd56cc28c6bdfe02b7740c4fded4a8b5a2261622409bfb2c5541f95481066e",
        "0a8de7215e58d5a1ae7b423139e5575a352dadd13aa250e1f8a388f50deca994",
    ),
    "emberhorn_fusion_moss_rampart_fire4_earth6": (
        "4b267b37e99447809d81da9b419f02a0da8a9127725d3d5d51e8f66b6468a36b",
        "bcfb0c16fc0985f2facc183d09d3f806d9d6c179c075254e17071a2ce3acb2fa",
    ),
}


PORTRAIT_IDENTITY_EVIDENCE_BUNDLE_METADATA_TRANSITIONS = {
    "blue_man_dragon_water10": (
        "cfa8c533846e891ba8abaf8443e1a377cf2f7935d78a428b6330ff9f0bde8396",
        "f9839c29fe47c387ab19e3fcad2e95b06dd205ee85cfc3ee5f7915e75704038d",
    ),
    "rebirth_beast_earth_lv50": (
        "50b4050913c37b96bdd6ba0c0cb627792938595cf4cb6fc771dfbbf0222c5a72",
        "6c42ba9a34bc28b61da1d4d6bfe2579f69529270293714ef59677db9e4fec554",
    ),
    "novice_tiger_mount": (
        "2fc56f40831368b0672ef9cf845003122fa9a511d03b1c8de47e3f452c296dc5",
        "dd77fb7b674b443cc05566b617f8c267a2da96493e9abc7e2b30e04ca450af79",
    ),
}
