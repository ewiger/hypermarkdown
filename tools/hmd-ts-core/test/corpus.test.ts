/**
 * The conformance runner (HMD-0020 §10).
 *
 * Every case in `examples/conformance/cases/` runs here. A case named in the
 * ledger is expected to fail; a ledger entry that *passes* fails the build,
 * because an
 * expected failure that starts succeeding and is not removed is how a ledger
 * rots into a lie.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { digestOf, resolveAddress, utf8Offset } from "../src/address.js";
import { check } from "../src/lint.js";
import { parseConfigToml } from "../src/config.js";
import { Workspace, DEFAULT_CONFIG } from "../src/workspace.js";
import { NodeHost } from "./nodeHost.js";
import { packageRoot, repoRoot } from "./repoRoot.js";

const casesDir = resolve(repoRoot, "examples/conformance/cases");

interface Expected {
  diagnostics: Array<Record<string, unknown>>;
  resolutions: Array<{ source: string; raw: string; target: string | null }>;
  /** Present when a case holds addresses of more than one step (HMD-0006). */
  addresses?: Array<Record<string, unknown>>;
}

// The ledger belongs to this package, so it is named relative to this package
// rather than through the repository root — moving the package must not be
// able to leave the path behind.
const ledger = JSON.parse(
  await readFile(resolve(packageRoot, "conformance-xfail.json"), "utf8"),
) as { cases: Array<{ id: string; reason: string }> };

const expectedToFail = new Set(ledger.cases.map((entry) => entry.id));

const names = (await readdir(casesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function runCase(name: string): Promise<Expected> {
  const root = resolve(casesDir, name, "tree");
  let config = DEFAULT_CONFIG;
  try {
    const toml = await readFile(resolve(casesDir, name, "config.toml"), "utf8");
    config = parseConfigToml(toml, "config.toml");
  } catch {
    // No per-case config: the defaults are the case.
  }

  const workspace = await Workspace.load(new NodeHost(root), config);

  const diagnostics = check(workspace).map((d) => {
    const out: Record<string, unknown> = {
      column: d.column,
      line: d.line,
      message: d.message,
      path: d.path,
      rule: d.rule,
      severity: d.severity,
    };
    if (d.candidates && d.candidates.length > 0) out["candidates"] = [...d.candidates];
    return out;
  });

  const resolutions: Expected["resolutions"] = [];
  const addresses: Array<Record<string, unknown>> = [];
  for (const source of workspace.pages()) {
    const document = workspace.documents.get(source);
    if (document === undefined) continue;
    for (const link of document.links) {
      const target = workspace.resolve(source, link.pageRef).path;
      resolutions.push({ source, raw: link.raw, target });
      if (link.fragmentKind !== "address") continue;
      // Where one address landed: a UTF-8 byte span, or the rule it failed.
      const entry: Record<string, unknown> = { raw: link.raw, source };
      const targetDoc = target === null ? undefined : workspace.documents.get(target);
      if (!link.address) {
        addresses.push({ ...entry, rule: "HMD019" });
      } else if (targetDoc === undefined) {
        addresses.push({ ...entry, rule: "HMD001" });
      } else {
        const result = resolveAddress(targetDoc, link.address, target!);
        if (result.failure !== null) {
          addresses.push({ ...entry, rule: result.failure[0] });
        } else {
          const text = targetDoc.text.slice(result.start, result.end);
          addresses.push({
            ...entry,
            start: utf8Offset(targetDoc.text, result.start),
            end: utf8Offset(targetDoc.text, result.end),
            text,
            digest: digestOf(text),
          });
        }
      }
    }
  }
  resolutions.sort(
    (a, b) =>
      compare(a.source, b.source) || compare(a.raw, b.raw) || compare(a.target ?? "", b.target ?? ""),
  );

  if (addresses.length === 0) return { diagnostics, resolutions };
  addresses.sort(
    (a, b) =>
      compare(a["source"] as string, b["source"] as string) ||
      compare(a["raw"] as string, b["raw"] as string),
  );
  return { diagnostics, resolutions, addresses };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

describe("conformance corpus", () => {
  it("has cases to run", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    const expectedFailure = expectedToFail.has(name);

    it(`${name}${expectedFailure ? " (ledgered as expected to fail)" : ""}`, async () => {
      const expectedJson = JSON.parse(
        await readFile(resolve(casesDir, name, "expected.json"), "utf8"),
      ) as Expected;
      const actual = await runCase(name);

      if (!expectedFailure) {
        expect(actual).toEqual(expectedJson);
        return;
      }

      // A ledgered case that matches is a ledger that needs deleting.
      expect(
        JSON.stringify(actual) !== JSON.stringify(expectedJson),
        `${name} is in conformance-xfail.json but now passes — remove the ledger entry`,
      ).toBe(true);
    });
  }
});
