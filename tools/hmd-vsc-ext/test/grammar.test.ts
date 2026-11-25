import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error — a build script in plain JavaScript, with no declarations.
import { embeddedLanguages, grammar, names, text } from "../syntaxes/fences.mjs";

/**
 * The grammars are data, and no tokenizer runs here. These tests hold the
 * parts that drift apart silently: the generated fence grammar and its
 * source, the manifest and the grammars it names, and the fence expressions
 * against the info strings a card really uses.
 */
function read(relative: string): string {
  return readFileSync(join(__dirname, relative), "utf8");
}

interface Rule {
  begin?: string;
  match?: string;
  end?: string;
  while?: string;
  include?: string;
  patterns?: Rule[];
}

const manifest = JSON.parse(read("../package.json")) as {
  contributes: {
    languages: { id: string; extensions: string[]; configuration: string }[];
    grammars: {
      language?: string;
      scopeName: string;
      path: string;
      embeddedLanguages?: Record<string, string>;
    }[];
  };
};

const fences = grammar() as { patterns: Rule[]; repository: Record<string, Rule> };

/**
 * A fence expression as JavaScript can run it. Oniguruma's `\G` and its
 * scoped `(?i:…)` have no JavaScript form; the first is dropped with the
 * line-start alternative it stands in, and the second becomes a plain group
 * under the `i` flag.
 */
function fence(key: string): RegExp {
  const begin = fences.repository[`fence-${key}`]!.begin!;
  return new RegExp(begin.replace("(^|\\G)", "(^)").replace("(?i:", "(?:"), "i");
}

describe("the cell fence grammar", () => {
  it("is the output of its generator", () => {
    expect(read("../syntaxes/hmd-fences.tmLanguage.json")).toBe(text());
  });

  it("is included by the card grammar ahead of the Markdown grammar", () => {
    const card = JSON.parse(read("../syntaxes/hmd.tmLanguage.json")) as {
      patterns: Rule[];
    };
    const order = card.patterns.map((pattern) => pattern.include);
    expect(order).toContain("source.hmd.fences");
    expect(order.indexOf("source.hmd.fences")).toBeLessThan(
      order.indexOf("text.html.markdown"),
    );
  });

  it("says which release of Linguist its language list is", () => {
    const list = JSON.parse(read("../syntaxes/languages.json")) as { source: string };
    expect(list.source).toMatch(/^github-linguist\/linguist v\d+\.\d+\.\d+,/);
  });

  it("reads the info strings a card uses", () => {
    const hql = fence("hql");
    for (const line of [
      "```hql",
      "```hql#eval",
      "```hql#query id=todo",
      "```hql#eval id=books hidden",
      "~~~hql#eval",
      "  ````hql#eval",
    ]) {
      expect(hql.test(line), line).toBe(true);
    }
    const match = hql.exec("```hql#eval id=books hidden")!;
    expect(match.slice(4, 8)).toEqual(["hql", "#", "eval", " id=books hidden"]);
  });

  it("does not take a longer word that starts with a language name", () => {
    expect(fence("hql").test("```hqlx")).toBe(false);
    expect(fence("python").test("```pythonic#eval")).toBe(false);
  });

  it("colours a cell in any language, with a mode and without one", () => {
    expect(fence("python").test("```python#eval")).toBe(true);
    expect(fence("python").test("```py#eval id=plot")).toBe(true);
    expect(fence("rust").test("~~~rust#check")).toBe(true);
    expect(fence("python").test("```python")).toBe(true);
    expect(fence("python").test("```python title=x")).toBe(true);
  });

  it("reads a diagram cell as its language with the mode `show`", () => {
    // `d2#show` and `mermaid#show` (HMD-0030) need no rule of their own: the
    // body is coloured by a D2 or Mermaid grammar when one is installed, and
    // is left in one colour when none is.
    const d2 = fence("d2").exec("```d2#show")!;
    expect(d2.slice(4, 7)).toEqual(["d2", "#", "show"]);
    const mermaid = fence("mermaid").exec("```mermaid#show")!;
    expect(mermaid.slice(4, 7)).toEqual(["mermaid", "#", "show"]);
    expect(fence("mermaid").test("```mermaid")).toBe(true);
  });

  it("leaves a fence with a Markdown separator to the Markdown grammar", () => {
    for (const line of ["```python:x", "```python,x", "```{.python}", "```"]) {
      expect(fence("python").test(line), line).toBe(false);
      expect(fence("other").test(line), line).toBe(false);
    }
  });

  it("knows the languages of GitHub Linguist by name, alias, and extension", () => {
    expect(fence("kotlin").test("```kotlin")).toBe(true);
    expect(fence("kotlin").test("```kt#eval")).toBe(true);
    expect(fence("toml").test("```toml")).toBe(true);
    expect(fence("csharp").test("```c#")).toBe(true);
    expect(fence("cpp").test("```c++#eval")).toBe(true);
    expect(fence("c").test("```c#eval")).toBe(true);
    expect(Object.keys(names()).length).toBeGreaterThan(700);
  });

  it("gives a fence name to one language only", () => {
    const seen = new Map<string, string>();
    for (const [key, list] of Object.entries(names() as Record<string, string[]>)) {
      for (const name of list) {
        const lower = name.toLowerCase();
        expect(seen.get(lower), `${name} in ${key}`).toBeUndefined();
        seen.set(lower, key);
      }
    }
  });

  it("takes a fence in a language it has no rule for", () => {
    const other = fence("other");
    const match = other.exec("```nosuchlang#eval id=a")!;
    expect(match.slice(4, 8)).toEqual(["nosuchlang", "#", "eval", " id=a"]);
    expect(other.exec("```q#")![4]).toBe("q#");
    expect(fences.repository["fence-other"]!.patterns).toBeUndefined();
  });

  it("guards the rules with the expression of the catch-all rule", () => {
    // The editor drops a rule whose body grammar is not installed. A guard
    // that matched where no rule did would leave the line half read.
    const guard = fences.patterns[0]!;
    const other = fences.repository["fence-other"]!.begin!;
    expect(guard.begin).toBe(`(^|\\G)(?=${other.slice("(^|\\G)".length)})`);
    expect(guard.patterns!.at(-1)!.include).toBe("#fence-other");
  });

  it("gives every language rule a body grammar", () => {
    for (const [key, rule] of Object.entries(fences.repository)) {
      if (!key.startsWith("fence-") || key === "fence-other") continue;
      const body = rule.patterns![0]!;
      expect(body.patterns!.length, key).toBeGreaterThan(0);
      for (const include of body.patterns!) {
        expect(include.include, key).toMatch(/^[^#$]/);
      }
    }
  });
});

describe("the manifest", () => {
  const grammars = manifest.contributes.grammars;

  it("maps the body of each cell to the language it is edited as", () => {
    const card = grammars.find((entry) => entry.scopeName === "source.hmd")!;
    expect(card.embeddedLanguages).toEqual(embeddedLanguages());
    expect(card.embeddedLanguages!["meta.embedded.block.hql"]).toBe("hql");
    expect(card.embeddedLanguages!["meta.embedded.block.yaml"]).toBe("yaml");
  });

  it("registers HQL as a language of its own, for .hql files", () => {
    const hql = manifest.contributes.languages.find((entry) => entry.id === "hql")!;
    expect(hql.extensions).toEqual([".hql"]);
    expect(() => JSON.parse(read(`../${hql.configuration}`))).not.toThrow();
    expect(grammars.find((entry) => entry.language === "hql")!.scopeName).toBe(
      "source.hql",
    );
  });

  it("names a grammar file for every scope, and each file declares that scope", () => {
    for (const entry of grammars) {
      const file = JSON.parse(read(`../${entry.path}`)) as { scopeName: string };
      expect(file.scopeName).toBe(entry.scopeName);
    }
  });
});

describe("the HQL grammar", () => {
  const hql = JSON.parse(read("../syntaxes/hql.tmLanguage.json")) as {
    patterns: Rule[];
    repository: Record<string, Rule>;
  };

  it("defines every rule it includes", () => {
    const visit = (rule: Rule): void => {
      if (rule.include?.startsWith("#")) {
        expect(hql.repository).toHaveProperty(rule.include.slice(1));
      }
      rule.patterns?.forEach(visit);
    };
    hql.patterns.forEach(visit);
    Object.values(hql.repository).forEach(visit);
  });

  it("reserves the words the HQL scanner reserves", () => {
    const source = JSON.stringify(hql.repository.keyword);
    for (const word of ["match", "given", "otherwise", "and", "or", "not"]) {
      expect(source).toContain(word);
    }
    expect(JSON.stringify(hql.repository.constant)).toContain("true|false");
  });
});
