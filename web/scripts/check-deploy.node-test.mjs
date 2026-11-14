import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDeployment } from "./check-deploy.mjs";

async function fixture(t, manifest = { reservoirs: [], dates: [] }) {
  const root = await mkdtemp(join(tmpdir(), "deploy-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "data"));
  await writeFile(join(root, "index.html"), "<!doctype html>");
  await writeFile(join(root, "data/index.json"), JSON.stringify(manifest));
  return root;
}

test("empty scaffold passes with an explicit warning", async (t) => {
  const result = await checkDeployment(await fixture(t));
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.includes("Data manifest is empty"));
});

test("blocks credentials without printing the matched value", async (t) => {
  const root = await fixture(t);
  const secret = ["EARTHDATA", "TOKEN=synthetic-sensitive-value"].join("_");
  await writeFile(join(root, "extra.txt"), secret);
  await writeFile(join(root, ".env.local"), "PLACEHOLDER=example");
  const result = await checkDeployment(root);
  assert.ok(result.errors.some((message) => message.includes("Earthdata")));
  assert.ok(result.errors.some((message) => message.includes("Private file")));
  assert.ok(!JSON.stringify(result).includes("synthetic-sensitive-value"));
});

test("rejects case mismatch and traversal even on case-insensitive filesystems", async (t) => {
  const root = await fixture(t, {
    reservoirs: [],
    dates: [{ browse: { HH: "image.png", HV: "../outside.png" } }],
  });
  await writeFile(join(root, "data/Image.png"), "image");
  const { errors } = await checkDeployment(root);
  assert.ok(errors.some((message) => message.includes("case-mismatched")));
  assert.ok(errors.some((message) => message.includes("Invalid local asset")));
});

test("rejects invalid JSON and symlinks", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "data/index.json"), "invalid");
  await symlink(join(root, "index.html"), join(root, "linked.html"));
  const { errors } = await checkDeployment(root);
  assert.ok(errors.some((message) => message.includes("Invalid JSON")));
  assert.ok(errors.some((message) => message.includes("Symbolic link")));
});

test("checks assets declared by reservoir metadata", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "data/reservoirs/test"), { recursive: true });
  await writeFile(
    join(root, "data/reservoirs/test/meta.json"),
    JSON.stringify({ assets: ["missing.bin"] }),
  );
  const { errors } = await checkDeployment(root);
  assert.ok(
    errors.some((message) =>
      message.includes("data/reservoirs/test/missing.bin"),
    ),
  );
});

async function reviewedFixture(t, native = false) {
  const root = await fixture(t, {
    mode: "mixed",
    release_method: native ? "relative_power_v3" : "pooled_otsu_v2",
    image_reservoirs: ["test"],
    numeric_reservoirs: [],
    reservoirs: [{ key: "test" }],
    dates: [
      {
        utc_date: "2026-03-17",
        browse: { HH: "browse/hh.png", HV: "browse/hv.png" },
      },
    ],
  });
  const assets = {
    "data/official/test.json": "{}",
    "data/browse/hh.png": "image",
    "data/browse/hv.png": "image",
    "data/provenance.json": '{"assets":[]}',
    "data/reservoirs/test/meta.json":
      '{"validation":{"grade":"C","publish_area":false}}',
    "data/reservoirs/test/mask.bin": new Uint8Array([1]),
    "data/reservoirs/test/timeseries.json": "{}",
    "data/reservoirs/test/timeseries.csv": "utc,official_pct\n2026-03-17,60\n",
    "data/reservoirs/test/20260317_HH.bin": new Uint8Array([1]),
    "data/reservoirs/test/20260317_HV.bin": new Uint8Array([1]),
    "data/methods.md": "# Reproducible methods\n",
    "data/validation.json": "{}",
    "data/historical-validation.json": "{}",
    "data/si-usage.json": "{}",
  };
  if (native) {
    assets["data/reservoirs/test/meta.json"] = JSON.stringify({
      validation: { grade: "C", publish_area: false },
      analysis: { mask: "analysis/mask.bin" },
    });
    assets["data/reservoirs/test/analysis/mask.bin"] = new Uint8Array([1]);
    assets["data/reservoirs/test/analysis/20260317_HH.bin"] = new Uint8Array([
      1,
    ]);
  }
  for (const [path, bytes] of Object.entries(assets)) {
    const slash = path.lastIndexOf("/");
    await mkdir(join(root, path.slice(0, slash)), { recursive: true });
    await writeFile(join(root, path), bytes);
  }
  return root;
}

test("requires all calibrated images even when the reservoir is grade C", async (t) => {
  const root = await reviewedFixture(t);
  assert.deepEqual((await checkDeployment(root)).errors, []);
  await rm(join(root, "data/reservoirs/test/20260317_HH.bin"));
  const { errors } = await checkDeployment(root);
  assert.ok(
    errors.some((message) =>
      message.includes("data/reservoirs/test/20260317_HH.bin"),
    ),
  );
});

test("requires the independent native analysis raster as well as display imagery", async (t) => {
  const root = await reviewedFixture(t, true);
  assert.deepEqual((await checkDeployment(root)).errors, []);
  await rm(join(root, "data/reservoirs/test/analysis/20260317_HH.bin"));
  const { errors } = await checkDeployment(root);
  assert.ok(
    errors.some((message) => message.includes("analysis/20260317_HH.bin")),
  );
});

test("rejects an omitted C-grade archive rather than silently skipping it", async (t) => {
  const root = await reviewedFixture(t);
  await rm(join(root, "data/reservoirs/test"), { recursive: true });
  const { errors } = await checkDeployment(root);
  assert.ok(
    errors.some((message) =>
      message.includes("data/reservoirs/test/meta.json"),
    ),
  );
  assert.ok(
    errors.some((message) => message.includes("data/reservoirs/test/mask.bin")),
  );
});

test("requires CSV downloads and the public method and validation reports", async (t) => {
  const root = await reviewedFixture(t);
  const required = [
    "data/reservoirs/test/timeseries.csv",
    "data/methods.md",
    "data/validation.json",
    "data/historical-validation.json",
    "data/si-usage.json",
  ];
  for (const path of required) await rm(join(root, path));
  const { errors } = await checkDeployment(root);
  for (const path of required)
    assert.ok(
      errors.some((message) => message.includes(path)),
      path,
    );
});
