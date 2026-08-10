import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {
  after,
  before,
  test,
} from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDir, "..");
const projectRepoRoot = path.resolve(skillRoot, "../../..");
const validatorPath = path.join(
  skillRoot,
  "scripts/validate_pet_design_spec.mjs",
);
const examplePath = path.join(
  skillRoot,
  "references/pet-design-spec.example.json",
);
const schemaPath = path.join(
  skillRoot,
  "references/pet-design-spec.schema.json",
);
const example = JSON.parse(fs.readFileSync(examplePath, "utf8"));

let fixtureContainer;
let fixture;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function repoPath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function buildRealPortraitFixture() {
  fixtureContainer = fs.mkdtempSync(
    path.join(os.tmpdir(), "beastbound-real-portrait-fixture-"),
  );
  fixtureContainer = fs.realpathSync(fixtureContainer);
  const userSiteResult = spawnSync(
    "python3",
    ["-c", "import site; print(site.getusersitepackages())"],
    {encoding: "utf8"},
  );
  assert.equal(userSiteResult.status, 0, userSiteResult.stderr);
  const pythonUserSite = userSiteResult.stdout.trim();
  const pythonPath = [
    pythonUserSite,
    process.env.PYTHONPATH,
  ].filter(Boolean).join(path.delimiter);
  const script = String.raw`
import base64
import json
import shutil
import sys
from pathlib import Path

project_repo = Path(sys.argv[1]).resolve()
fixture_container = Path(sys.argv[2]).resolve()
sys.path.insert(0, str(project_repo / "tools"))

import build_pet_portrait as portrait
from PIL import Image, ImageDraw, PngImagePlugin

repo_root = fixture_container / "repo"
fake_home = fixture_container / "home"
form_id = "fixture_pet"
pet_root = repo_root / "client/godot/assets/pets" / form_id
identity_root = pet_root / "identity"
source_root = pet_root / "source"
prompt_root = pet_root / "prompts"
for directory in (identity_root, source_root, prompt_root):
    directory.mkdir(parents=True, exist_ok=True)

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

def identity_pose(path, color, reverse=False):
    image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    points = (
        ((256, 48), (438, 430), (74, 430))
        if not reverse
        else ((256, 62), (82, 420), (430, 420))
    )
    draw.polygon(points, fill=(*color, 255))
    draw.rectangle((220, 135, 292, 378), fill=(20, 62, 140, 255))
    image.save(path, format="PNG")
    return image

front_path = identity_root / "front_3quarter_sw.png"
back_path = identity_root / "back_3quarter_ne.png"
front_image = identity_pose(front_path, (45, 102, 178))
back_image = identity_pose(back_path, (64, 122, 74), reverse=True)
identity_lock_path = identity_root / "identity-lock.md"
identity_lock_path.write_text(
    "# Fixture identity lock\n"
    "Canonical front and back identity poses are frozen for builder contract "
    "replay and may not be replaced by portrait output.\n",
    encoding="utf-8",
)
bundle_ownership_path = pet_root / "source-and-ownership.md"
bundle_ownership_path.write_text(
    "# Fixture bundle ownership\nOriginal test fixture authored for "
    "deterministic contract validation.\n",
    encoding="utf-8",
)
identity_prompt_path = prompt_root / "identity-board-v1.txt"
identity_prompt_path.write_text(
    "Original identity board fixture prompt.\n",
    encoding="utf-8",
)
pipeline_path = source_root / "identity-board-pipeline-meta.json"
write_json(
    pipeline_path,
    {
        "schemaVersion": 1,
        "slots": ["front_3quarter_sw", "back_3quarter_ne"],
        "frames": [
            {
                "slot": "front_3quarter_sw",
                "sourceRgbaSha256": portrait.rgba_hash(
                    front_image.convert("RGBA")
                ),
            },
            {
                "slot": "back_3quarter_ne",
                "sourceRgbaSha256": portrait.rgba_hash(
                    back_image.convert("RGBA")
                ),
            },
        ],
    },
)
action_metadata_path = pet_root / "action-bundle-meta.json"
write_json(
    action_metadata_path,
    {
        "schemaVersion": 1,
        "formId": form_id,
        "identity": {
            "status": "self_review_passed_owner_pending",
            "identityLock": "identity/identity-lock.md",
            "poses": {
                "front_3quarter_sw": "identity/front_3quarter_sw.png",
                "back_3quarter_ne": "identity/back_3quarter_ne.png",
            },
        },
        "sourceArchive": {
            "pipelineMetadata": "source/identity-board-pipeline-meta.json",
        },
    },
)

catalog_path = repo_root / portrait.DEFAULT_CATALOG_PATH
write_json(
    catalog_path,
    {
        "schemaVersion": 1,
        "forms": [
            {
                "formId": form_id,
                "pet": {
                    "root": pet_root.relative_to(repo_root).as_posix(),
                    "portraitPath": (
                        pet_root / portrait.RUNTIME_PATH
                    ).relative_to(repo_root).as_posix(),
                    "metadataPath": (
                        action_metadata_path.relative_to(repo_root).as_posix()
                    ),
                    "identityPath": (
                        identity_lock_path.relative_to(repo_root).as_posix()
                    ),
                    "ownershipPath": (
                        bundle_ownership_path.relative_to(repo_root).as_posix()
                    ),
                    "promptPath": (
                        identity_prompt_path.relative_to(repo_root).as_posix()
                    ),
                },
            },
        ],
    },
)

session_id = "11111111-1111-4111-8111-111111111111"
generation_id = "call_" + ("A" * 24)
cache_path = (
    fake_home
    / ".codex/generated_images"
    / session_id
    / f"{generation_id}.png"
)
cache_path.parent.mkdir(parents=True, exist_ok=True)
source_image = Image.new(
    "RGB",
    (portrait.MIN_SOURCE_SIZE, portrait.MIN_SOURCE_SIZE),
    portrait.DEFAULT_KEY,
)
draw = ImageDraw.Draw(source_image)
draw.rounded_rectangle(
    (180, 96, 844, 900),
    radius=210,
    fill=(117, 72, 38),
    outline=(180, 40, 180),
    width=2,
)
draw.ellipse((340, 300, 420, 380), fill=(35, 204, 72))
draw.ellipse((604, 300, 684, 380), fill=(35, 204, 72))
draw.polygon(
    ((512, 410), (455, 550), (569, 550)),
    fill=(235, 184, 74),
)
png_info = PngImagePlugin.PngInfo()
png_info.add_text("provenance", "OpenAI Media Service API")
source_image.save(cache_path, format="PNG", pnginfo=png_info)
generator_bytes = cache_path.read_bytes()

production = repo_root / ".run/pet-portrait-generation" / form_id
production.mkdir(parents=True, exist_ok=True)
input_path = production / "headshot-chroma.png"
shutil.copyfile(cache_path, input_path)
prompt_path = production / "prompt.txt"
prompt_path.write_text(
    "Create one dedicated independently authored head-and-upper-body pet "
    "portrait on a solid #FF00FF chroma background. Never crop or derive "
    "it from full-body, world, battle, mounted, or identity artwork.\n",
    encoding="utf-8",
)
result_path = production / "result.txt"
result_path.write_text(
    "\n".join(
        [
            f"generatorResultPath: {cache_path}",
            f"generatorCallId: {generation_id}",
            f"workspaceRawPath: {input_path}",
            f"sha256: {portrait.sha256_file(input_path)}",
            f"formId: {form_id}",
            "generator: built-in imagegen",
        ]
    )
    + "\n",
    encoding="utf-8",
)
selection_path = repo_root / portrait.SELECTED_SOURCES_PATH
write_json(
    selection_path,
    {
        "schemaVersion": 1,
        "catalog": portrait.repo_relative(catalog_path, repo_root),
        "entries": [
            {
                "formId": form_id,
                "petRoot": portrait.repo_relative(pet_root, repo_root),
                "input": portrait.repo_relative(input_path, repo_root),
                "prompt": portrait.repo_relative(prompt_path, repo_root),
                "result": portrait.repo_relative(result_path, repo_root),
                "generationId": generation_id,
                "key": "FF00FF",
                "isolated": False,
            },
        ],
    },
)

transcript_path = (
    fake_home
    / ".codex/sessions/2026/07/29"
    / f"rollout-fixture-{session_id}.jsonl"
)
transcript_path.parent.mkdir(parents=True, exist_ok=True)
records = [
    {
        "type": "session_meta",
        "payload": {"id": session_id},
    },
    {
        "type": "response_item",
        "payload": {
            "type": "function_call",
            "namespace": "image_gen",
            "name": "imagegen",
            "call_id": generation_id,
            "arguments": json.dumps(
                {
                    "prompt": prompt_path.read_text(encoding="utf-8"),
                    "referenced_image_paths": [str(front_path)],
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        },
    },
    {
        "type": "event_msg",
        "payload": {
            "type": "image_generation_end",
            "call_id": generation_id,
            "status": "completed",
            "saved_path": str(cache_path),
            "result": base64.b64encode(generator_bytes).decode("ascii"),
        },
    },
]
transcript_path.write_text(
    "".join(
        json.dumps(record, separators=(",", ":")) + "\n"
        for record in records
    ),
    encoding="utf-8",
)

attestation_path = production / "generation-attestation.json"
portrait.write_generation_attestation(
    portrait.GenerationAttestationOptions(
        repo_root=repo_root,
        pet_root=pet_root,
        form_id=form_id,
        input_path=input_path,
        identity_reference=front_path,
        prompt_path=prompt_path,
        generation_result=result_path,
        output_path=attestation_path,
        generation_id=generation_id,
        catalog_path=catalog_path,
    )
)
options = portrait.PortraitBuildOptions(
    repo_root=repo_root,
    pet_root=pet_root,
    form_id=form_id,
    input_path=input_path,
    identity_reference=front_path,
    prompt_path=prompt_path,
    generation_attestation=attestation_path,
    generation_id=generation_id,
    catalog_path=catalog_path,
    write=True,
)
metadata = portrait.build_portrait(options)
metadata_path = pet_root / portrait.METADATA_PATH
installed_attestation = pet_root / portrait.ATTESTATION_PATH

print(json.dumps({
    "repoRoot": str(repo_root),
    "fakeHome": str(fake_home),
    "petRoot": str(pet_root),
    "formId": form_id,
    "metadataPath": str(metadata_path),
    "attestationPath": str(installed_attestation),
    "runtimePath": str(pet_root / portrait.RUNTIME_PATH),
    "metadata": metadata,
}, ensure_ascii=False))
`;
  const result = spawnSync(
    "python3",
    ["-c", script, projectRepoRoot, fixtureContainer],
    {
      cwd: projectRepoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
      env: {
        ...process.env,
        HOME: path.join(fixtureContainer, "home"),
        PYTHONPATH: pythonPath,
      },
    },
  );
  assert.equal(
    result.status,
    0,
    `真实 builder fixture 创建失败:\n${result.stdout}\n${result.stderr}`,
  );
  const value = JSON.parse(result.stdout);
  value.pythonPath = pythonPath;
  value.metadataRepoPath = repoPath(value.repoRoot, value.metadataPath);
  value.attestationRepoPath = repoPath(
    value.repoRoot,
    value.attestationPath,
  );
  value.metadataSha256 = sha256(fs.readFileSync(value.metadataPath));
  value.attestationSha256 = sha256(
    fs.readFileSync(value.attestationPath),
  );
  return value;
}

before(() => {
  fixture = buildRealPortraitFixture();
});

after(() => {
  if (fixtureContainer) {
    fs.rmSync(fixtureContainer, {recursive: true, force: true});
  }
});

function validateSpec(mutate = () => {}) {
  const temporaryDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "beastbound-pet-portrait-spec-"),
  );
  try {
    const spec = structuredClone(example);
    mutate(spec);
    const specPath = path.join(temporaryDir, "spec.json");
    fs.writeFileSync(
      specPath,
      `${JSON.stringify(spec, null, 2)}\n`,
    );
    const result = spawnSync(
      process.execPath,
      [
        validatorPath,
        specPath,
        "--json",
        "--repo-root",
        fixture.repoRoot,
      ],
      {
        cwd: projectRepoRoot,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 120_000,
        env: {
          ...process.env,
          HOME: fixture.fakeHome,
          PYTHONPATH: fixture.pythonPath,
        },
      },
    );
    assert.equal(result.signal, null, result.stderr);
    return {
      status: result.status,
      result: JSON.parse(result.stdout),
    };
  } finally {
    fs.rmSync(temporaryDir, {recursive: true, force: true});
  }
}

function configureOwnerReviewPending(spec) {
  const metadata = fixture.metadata;
  spec.taxonomy.formId = fixture.formId;
  spec.presentation.artStatus = "owner_review_pending";
  spec.presentation.artProduction.ownerReviewStatus = "pending";
  spec.presentation.artProduction.evidencePaths = [
    ".run/pet-art/example/review/full-art.png",
  ];
  const portrait = spec.presentation.artProduction.portrait;
  portrait.source = {
    status: "available",
    method: "original_generated_from_identity_board",
    identityReferencePaths: [
      metadata.identityReference.path,
    ],
    sourceAssetPaths: [
      metadata.assets.originalGeneratedPng.path,
      metadata.assets.master.path,
    ],
    ownershipRecordPath: metadata.ownership.path,
    portraitMetadataPath: fixture.metadataRepoPath,
    portraitMetadataSha256: fixture.metadataSha256,
    generationAttestationPath: fixture.attestationRepoPath,
    generationAttestationSha256: fixture.attestationSha256,
  };
  portrait.ownerReviewStatus = "pending";
  portrait.evidencePaths = [
    ".run/pet-art/example/review/portrait-native-and-compact.png",
    ".run/pet-art/example/review/portrait-runtime-consumers.png",
  ];
}

test("schema requires real builder metadata and attestation for available portraits", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const artProduction = schema.properties.presentation.properties.artProduction;
  assert.ok(artProduction.required.includes("portrait"));

  const portrait = artProduction.properties.portrait;
  assert.equal(portrait.additionalProperties, false);
  assert.equal(
    portrait.properties.capability.const,
    "shared_dedicated_headshot_v1",
  );
  assert.equal(portrait.properties.independentlyAuthored.const, true);
  assert.equal(portrait.properties.fullBodyCropAllowed.const, false);
  assert.equal(portrait.properties.ownerReviewRequired.const, true);
  assert.match(
    JSON.stringify(portrait.properties.sharedUses.allOf),
    /pet_roster_bar/,
  );
  assert.match(
    JSON.stringify(portrait.properties.sharedUses.allOf),
    /pet_codex/,
  );
  assert.match(
    JSON.stringify(portrait.properties.sharedUses.allOf),
    /ride_permit/,
  );
  assert.match(
    JSON.stringify(portrait.properties.sharedUses.allOf),
    /pet_egg/,
  );
  assert.deepEqual(
    portrait.properties.source.required,
    [
      "status",
      "method",
      "identityReferencePaths",
      "sourceAssetPaths",
      "ownershipRecordPath",
    ],
  );
  const availableContract = JSON.stringify(
    portrait.properties.source.allOf,
  );
  assert.match(availableContract, /portraitMetadataPath/);
  assert.match(availableContract, /portraitMetadataSha256/);
  assert.match(availableContract, /generationAttestationPath/);
  assert.match(availableContract, /generationAttestationSha256/);
  assert.doesNotMatch(
    availableContract,
    /productionManifest|identityGate/,
  );
});

test("planned formal example keeps the dedicated shared portrait contract", () => {
  const checked = validateSpec();
  assert.equal(checked.status, 0);
  assert.equal(checked.result.ok, true);

  const portrait = example.presentation.artProduction.portrait;
  assert.equal(portrait.capability, "shared_dedicated_headshot_v1");
  assert.equal(portrait.independentlyAuthored, true);
  assert.equal(portrait.fullBodyCropAllowed, false);
  assert.equal(portrait.source.status, "planned");
  assert.ok(portrait.source.identityReferencePaths.length > 0);
  assert.ok(portrait.source.sourceAssetPaths.length > 0);
  assert.ok(portrait.source.ownershipRecordPath);
});

test("concept-only deferred design may omit production, while release-shaped deferred data fails", () => {
  const conceptOnly = validateSpec((spec) => {
    spec.presentation.artStatus = "deferred";
    delete spec.presentation.artProduction;
  });
  assert.equal(conceptOnly.status, 0);
  assert.equal(conceptOnly.result.ok, true);

  const releaseShaped = validateSpec((spec) => {
    spec.presentation.artStatus = "deferred";
  });
  assert.equal(releaseShaped.status, 1);
  assert.ok(
    releaseShaped.result.errors.some(
      (message) => message.includes("artStatus=deferred")
        && message.includes("禁止携带 artProduction"),
    ),
  );
});

test("formal art rejects missing, cropped, or non-independent portraits", () => {
  const missing = validateSpec((spec) => {
    delete spec.presentation.artProduction.portrait;
  });
  assert.equal(missing.status, 1);
  assert.ok(
    missing.result.errors.some(
      (message) => message.includes("artProduction.portrait 必须是对象"),
    ),
  );

  const cropped = validateSpec((spec) => {
    spec.presentation.artProduction.portrait.fullBodyCropAllowed = true;
  });
  assert.equal(cropped.status, 1);
  assert.ok(
    cropped.result.errors.some(
      (message) => message.includes("禁止裁切全身"),
    ),
  );

  const notIndependent = validateSpec((spec) => {
    spec.presentation.artProduction.portrait.independentlyAuthored = false;
  });
  assert.equal(notIndependent.status, 1);
  assert.ok(
    notIndependent.result.errors.some(
      (message) => message.includes("必须独立绘制"),
    ),
  );
});

test("portrait remains one shared asset for all baseline compact consumers", () => {
  for (const requiredUse of [
    "pet_roster_bar",
    "pet_codex",
    "ride_permit",
    "pet_egg",
  ]) {
    const checked = validateSpec((spec) => {
      const portrait = spec.presentation.artProduction.portrait;
      portrait.sharedUses = portrait.sharedUses.filter(
        (value) => value !== requiredUse,
      );
    });
    assert.equal(checked.status, 1, requiredUse);
    assert.ok(
      checked.result.errors.some(
        (message) => message.includes(`必须包含 ${requiredUse}`),
      ),
      requiredUse,
    );
  }
});

test("available portrait passes only through the real builder and single-target auditor", () => {
  const checked = validateSpec(configureOwnerReviewPending);
  assert.equal(
    checked.status,
    0,
    checked.result.errors.join("\n"),
  );
  assert.equal(checked.result.ok, true);
  assert.equal(fixture.metadata.tool, "build_pet_portrait.py");
  assert.equal(
    fixture.metadata.source.generationAttestation.path,
    fixture.attestationRepoPath,
  );
});

test("available portrait rejects missing or hash-drifted real production records", () => {
  const missingMetadata = validateSpec((spec) => {
    configureOwnerReviewPending(spec);
    delete spec.presentation.artProduction.portrait.source
      .portraitMetadataPath;
    delete spec.presentation.artProduction.portrait.source
      .portraitMetadataSha256;
  });
  assert.equal(missingMetadata.status, 1);
  assert.ok(
    missingMetadata.result.errors.some(
      (message) => message.includes("portraitMetadataPath"),
    ),
  );

  const wrongMetadataHash = validateSpec((spec) => {
    configureOwnerReviewPending(spec);
    spec.presentation.artProduction.portrait.source
      .portraitMetadataSha256 = "0".repeat(64);
  });
  assert.equal(wrongMetadataHash.status, 1);
  assert.ok(
    wrongMetadataHash.result.errors.some(
      (message) => message.includes("portraitMetadataPath sha256 不匹配"),
    ),
  );

  const wrongAttestationHash = validateSpec((spec) => {
    configureOwnerReviewPending(spec);
    spec.presentation.artProduction.portrait.source
      .generationAttestationSha256 = "0".repeat(64);
  });
  assert.equal(wrongAttestationHash.status, 1);
  assert.ok(
    wrongAttestationHash.result.errors.some(
      (message) => message.includes("generationAttestationPath sha256 不匹配"),
    ),
  );
});

test("available portrait binds the exact identity and durable source files from portrait-meta", () => {
  const wrongIdentity = validateSpec((spec) => {
    configureOwnerReviewPending(spec);
    spec.presentation.artProduction.portrait.source
      .identityReferencePaths = [
        fixture.metadata.assets.master.path,
      ];
  });
  assert.equal(wrongIdentity.status, 1);
  assert.ok(
    wrongIdentity.result.errors.some(
      (message) => message.includes(
        "identityReferencePaths 必须精确绑定",
      ),
    ),
  );

  const unprovedSource = validateSpec((spec) => {
    configureOwnerReviewPending(spec);
    spec.presentation.artProduction.portrait.source.sourceAssetPaths.push(
      fixture.metadata.assets.runtime.path,
    );
  });
  assert.equal(unprovedSource.status, 1);
  assert.ok(
    unprovedSource.result.errors.some(
      (message) => message.includes("未由真实 builder metadata 证明"),
    ),
  );
});

test("real auditor catches a tampered runtime PNG instead of trusting its filename", () => {
  const original = fs.readFileSync(fixture.runtimePath);
  const tamper = spawnSync(
    "python3",
    [
      "-c",
      [
        "from pathlib import Path",
        "from PIL import Image",
        "path = Path(__import__('sys').argv[1])",
        "with Image.open(path) as image:",
        "    changed = image.convert('RGBA').resize((64, 64))",
        "changed.save(path, format='PNG')",
      ].join("\n"),
      fixture.runtimePath,
    ],
    {encoding: "utf8"},
  );
  assert.equal(tamper.status, 0, tamper.stderr);
  try {
    const checked = validateSpec(configureOwnerReviewPending);
    assert.equal(checked.status, 1);
    assert.ok(
      checked.result.errors.some(
        (message) => message.includes("single-target audit 失败")
          && (
            message.includes("runtime.sha256")
            || message.includes("runtime 尺寸")
          ),
      ),
      checked.result.errors.join("\n"),
    );
  } finally {
    fs.writeFileSync(fixture.runtimePath, original);
  }
});

test("a locally authored decision cannot turn pending portrait metadata into owner approval", () => {
  const decisionPath = path.join(
    fixture.repoRoot,
    ".run/local-owner-decision.json",
  );
  fs.mkdirSync(path.dirname(decisionPath), {recursive: true});
  fs.writeFileSync(
    decisionPath,
    `${JSON.stringify({
      schemaVersion: 2,
      decisionType: "beastbound_pet_portrait_owner_approval",
      ownerId: "project-owner:fander",
      decision: "approved",
    }, null, 2)}\n`,
  );
  try {
    const checked = validateSpec((spec) => {
      configureOwnerReviewPending(spec);
      spec.presentation.artStatus = "approved";
      spec.presentation.artProduction.ownerReviewStatus = "approved";
      const portrait = spec.presentation.artProduction.portrait;
      portrait.ownerReviewStatus = "approved";
      portrait.ownerDecisionPath = repoPath(
        fixture.repoRoot,
        decisionPath,
      );
      portrait.ownerDecisionSha256 = sha256(
        fs.readFileSync(decisionPath),
      );
    });
    assert.equal(checked.status, 1);
    assert.ok(
      checked.result.errors.some(
        (message) => message.includes(
          "本地自造 decision 不能建立 owner 批准",
        ),
      ),
      checked.result.errors.join("\n"),
    );
  } finally {
    fs.rmSync(decisionPath, {force: true});
  }
});

test("planned portrait source can never claim owner approval", () => {
  const checked = validateSpec((spec) => {
    spec.presentation.artProduction.portrait.ownerReviewStatus = "approved";
    spec.presentation.artProduction.portrait.evidencePaths = [
      ".run/pet-art/example/review/portrait-runtime-consumers.png",
    ];
  });
  assert.equal(checked.status, 1);
  assert.ok(
    checked.result.errors.some(
      (message) => message.includes("source.status=planned")
        && message.includes("ownerReviewStatus 不能为 approved"),
    ),
  );
});
