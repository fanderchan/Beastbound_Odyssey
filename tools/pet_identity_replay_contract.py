#!/usr/bin/env python3
"""Shared compatibility data for frozen pet identity replay digests.

Identity-gate metadata created before replay digest contract v2 hashed the
builder's absolute input path. The first two closed fusion registrations froze
those historical source/destination digests in tracked manifests. Keep the
exact values here so generic audits and the dedicated release verifier use one
compatibility authority without weakening new checkout-portable gates.
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
