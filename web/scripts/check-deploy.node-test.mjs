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
