/**
 * The fence rules of a cell: `syntaxes/hmd-fences.tmLanguage.json` is this
 * file's output, and is never edited by hand.
 *
 *     node syntaxes/fences.mjs
 *
 * A cell is a fenced block whose info string names a language and a mode,
 * `hql#eval id=books hidden`. VS Code's Markdown grammar colours the body of
 * a fence by its language, and accepts a space, a colon, a comma, a brace or
 * a question mark after the name. It does not accept `#`, so it reads
 * `python#eval` as an unknown language and leaves the body in one colour.
 *
 * A TextMate grammar cannot choose the grammar of a body from the text it
 * matched, so there is one rule for each language. The languages come from
 * two tables:
 *
 *   - `BUILT_IN`, below: the language list of the Markdown grammar, with
 *     `hql` added. These are the scopes VS Code's own grammars declare, and
 *     each row names the editor's language id.
 *   - `languages.json`: every language of GitHub Linguist that has a TextMate
 *     scope, written by `linguist.py`. A language that matches a built-in row
 *     adds its names to that row and keeps the row's scope. Every other
 *     language gets a row with Linguist's scope.
 *
 * A body is coloured when an installed extension provides the row's scope.
 * The editor drops a rule whose body grammar is not installed, so a last
 * rule, `fence-other`, takes every fence that no language rule took. It
 * colours the fence line and leaves the body in one colour.
 *
 * Every rule takes the plain fence and the fence with a `#mode` suffix. A
 * fence nested in a list or a quote is still read by the Markdown grammar,
 * and so is a fence that uses one of its own separators, `python:x`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * One row for each built-in language: the scope suffix, the names a fence may
 * use, the grammars of the body, and the VS Code language id the body is
 * edited as. A row with no language id is still coloured; comment toggling
 * and bracket matching inside it stay those of the card.
 */
const BUILT_IN = [
  ["hql", "hql", ["source.hql"], "hql"],
  ["css", "css", ["source.css"], "css"],
  ["html", "html|htm|shtml|xhtml", ["text.html.basic"], "html"],
  ["ini", "ini|conf", ["source.ini"], "ini"],
  ["java", "java|bsh", ["source.java"], "java"],
  ["lua", "lua", ["source.lua"], "lua"],
  ["makefile", "makefile|GNUmakefile", ["source.makefile"], "makefile"],
  ["perl", "perl|pl|pm|pod", ["source.perl"], "perl"],
  ["r", "r|Rprofile", ["source.r"], "r"],
  ["ruby", "ruby|rb|rake|gemspec", ["source.ruby"], "ruby"],
  ["php", "php|phtml", ["text.html.basic", "source.php"], "php"],
  ["sql", "sql|ddl|dml", ["source.sql"], "sql"],
  ["vs_net", "vb", ["source.asp.vb.net"], "vb"],
  ["xml", "xml|xsd|rss|opml", ["text.xml"], "xml"],
  ["xsl", "xsl|xslt", ["text.xml.xsl"], "xsl"],
  ["yaml", "yaml|yml", ["source.yaml"], "yaml"],
  ["dosbatch", "bat|batch", ["source.batchfile"], "bat"],
  ["clojure", "clj|cljs|clojure", ["source.clojure"], "clojure"],
  ["coffee", "coffee|Cakefile", ["source.coffee"], "coffeescript"],
  ["c", "c|h", ["source.c"], "c"],
  ["cpp", "cpp|c++|cxx", ["source.cpp"], "cpp"],
  ["diff", "patch|diff|rej", ["source.diff"], "diff"],
  ["dockerfile", "dockerfile", ["source.dockerfile"], "dockerfile"],
  ["go", "go|golang", ["source.go"], "go"],
  ["groovy", "groovy|gvy", ["source.groovy"], "groovy"],
  ["pug", "jade|pug", ["text.pug"], "jade"],
  ["ignore", "gitignore|ignore", ["source.ignore"], "ignore"],
  ["javascript", "js|jsx|javascript|es6|mjs|cjs", ["source.js"], "javascript"],
  ["js_regexp", "regexp", ["source.js.regexp"], null],
  ["json", "json|json5", ["source.json"], "json"],
  ["jsonc", "jsonc", ["source.json.comments"], "jsonc"],
  ["jsonl", "jsonl|jsonlines", ["source.json.lines"], "jsonl"],
  ["less", "less", ["source.css.less"], "less"],
  ["objc", "objectivec|objective-c|mm|objc|obj-c|m", ["source.objc"], "objective-c"],
  ["swift", "swift", ["source.swift"], "swift"],
  ["scss", "scss", ["source.css.scss"], "scss"],
  ["perl6", "perl6|p6|pl6|pm6|nqp", ["source.perl.6"], "perl6"],
  ["powershell", "powershell|ps1|psm1|psd1|pwsh", ["source.powershell"], "powershell"],
  ["python", "python|py|py3|rpy|pyw", ["source.python"], "python"],
  ["julia", "julia", ["source.julia"], "julia"],
  ["regexp_python", "re", ["source.regexp.python"], null],
  ["rust", "rust|rs", ["source.rust"], "rust"],
  ["scala", "scala|sbt", ["source.scala"], null],
  ["shellscript", "shell|sh|bash|zsh", ["source.shell"], "shellscript"],
  ["typescript", "typescript|ts", ["source.ts"], "typescript"],
  ["typescriptreact", "tsx", ["source.tsx"], "typescriptreact"],
  ["csharp", "cs|csharp", ["source.cs"], "csharp"],
  ["fsharp", "fs|fsharp", ["source.fsharp"], "fsharp"],
  ["dart", "dart", ["source.dart"], "dart"],
  ["handlebars", "handlebars|hbs", ["text.html.handlebars"], "handlebars"],
  ["markdown", "markdown|md", ["text.html.markdown"], "markdown"],
  ["log", "log", ["text.log"], "log"],
  ["erlang", "erlang", ["source.erlang"], null],
  ["elixir", "elixir", ["source.elixir"], null],
  ["latex", "latex|tex", ["text.tex.latex"], "latex"],
  ["bibtex", "bibtex", ["text.bibtex"], "bibtex"],
  ["twig", "twig", ["source.twig"], null],
  ["restructuredtext", "restructuredtext|rst", ["source.rst"], "restructuredtext"],
];

/**
 * A Linguist language that is a built-in row under another name, by the key
 * of the row. Without this the two share no name and would be two rules.
 */
const SAME_AS = {
  "Visual Basic .NET": "vs_net",
  Raku: "perl6",
  "Regular Expression": "js_regexp",
  "Git Ignore": "ignore",
  "Ignore List": "ignore",
};

/** A Linguist scope that VS Code's own grammar declares under another name. */
const SCOPE = {
  "source.objc++": "source.objcpp",
};

const SUFFIX = "(?:(#)([A-Za-z][\\w-]*))?";
const OPEN = "(\\s*)(`{3,}|~{3,})\\s*";
const REST = "(\\s[^`]*)?$";

/** A name as the text of an expression. */
function escape(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, (character) => `\\${character}`);
}

/** A name as a fence writes it: lower case, and a dash for a space. */
function fenceName(name) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

/**
 * The rows of the grammar: the built-in rows first, then Linguist's, each as
 * `[key, names, scopes, languageId]` with `names` a list.
 */
function rows() {
  const { languages } = JSON.parse(
    readFileSync(join(HERE, "languages.json"), "utf8"),
  );
  const table = BUILT_IN.map(([key, names, scopes, id]) => [
    key,
    names.split("|"),
    scopes,
    id,
  ]);
  const byKey = new Map(table.map((row) => [row[0], row]));
  const builtIn = new Set(table);

  /** Every fence name taken so far, in lower case, and the row that has it. */
  const taken = new Map();
  for (const row of table) {
    for (const name of row[1]) taken.set(name.toLowerCase(), row);
  }
  const claim = (row, name) => {
    if (!name || /[\s`~]/.test(name) || taken.has(name)) return;
    taken.set(name, row);
    row[1].push(name);
  };

  const rowOf = new Map();
  const keys = new Set(byKey.keys());
  for (const language of languages) {
    const names = [language.name, ...language.aliases].map(fenceName);
    let row =
      byKey.get(SAME_AS[language.name]) ??
      names.map((name) => taken.get(name)).find((found) => builtIn.has(found));
    if (!row) {
      let key = fenceName(language.name)
        .replace(/\+/g, "p")
        .replace(/#/g, "sharp")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      while (keys.has(key)) key += "_";
      keys.add(key);
      row = [key, [], [SCOPE[language.scope] ?? language.scope], null];
      table.push(row);
    }
    rowOf.set(language, row);
    for (const name of names) claim(row, name);
  }

  // A file extension names a language when only one language has it. `kt`
  // and `toml` are fence names this way; `h` and `pl` belong to several
  // languages, and stay with the built-in row that lists them.
  const owners = new Map();
  for (const language of languages) {
    for (const extension of language.extensions) {
      const name = extension.slice(1).toLowerCase();
      if (!/^[a-z0-9_+-]+$/.test(name)) continue;
      owners.set(name, [...(owners.get(name) ?? []), language]);
    }
  }
  for (const [name, list] of owners) {
    if (list.length === 1) claim(rowOf.get(list[0]), name);
  }
  return table.filter((row) => row[1].length > 0);
}

/**
 * A language name of no particular language: a word with none of the
 * separators the Markdown grammar reads after a name. A `#` belongs to the
 * name unless a mode follows it, so `c#` is a name and `c#eval` is a cell.
 */
const ANY_NAME = "(?![^\\s`]*[:,{?])((?:[^\\s`#]|#(?![A-Za-z]))+)";

/** The opening line of any fence the rules of this grammar may take. */
const ANY_FENCE = `${OPEN}${ANY_NAME}${SUFFIX}${REST}`;

/** A fence rule: `name` is the expression of the language name, in a group. */
function fence(name, body) {
  return {
    begin: `(^|\\G)${OPEN}${name}${SUFFIX}${REST}`,
    end: "(^|\\G)(\\2|\\s{0,3})(\\3)\\s*$",
    name: "markup.fenced_code.block.markdown",
    beginCaptures: {
      3: { name: "punctuation.definition.markdown" },
      4: { name: "fenced_code.block.language.markdown" },
      5: { name: "punctuation.separator.cell-mode.hmd" },
      6: { name: "keyword.control.cell-mode.hmd" },
      7: {
        name: "fenced_code.block.language.attributes.markdown",
        patterns: [{ include: "#attribute" }],
      },
    },
    endCaptures: {
      3: { name: "punctuation.definition.markdown" },
    },
    ...(body ? { patterns: [body] } : {}),
  };
}

function rule([key, names, includes]) {
  const any = names.map(escape).join("|");
  return fence(`(?i:(${any}))`, {
    begin: "(^|\\G)(\\s*)(.*)",
    while: "(^|\\G)(?!\\s*([`~]{3,})\\s*$)",
    contentName: `meta.embedded.block.${key}`,
    patterns: includes.map((include) => ({ include })),
  });
}

/**
 * The grammar. Its one top-level rule is a guard: a lookahead that matches
 * the opening line of a fence, so that a line that opens no fence costs one
 * expression and not one for each language. Inside the guard the rule of the
 * language matches at the same place, or `fence-other` does, and the guard
 * closes after it without taking any text. The guard and `fence-other` are
 * the same expression: a guard that matched where no rule inside it did
 * would leave the line half read.
 */
export function grammar() {
  const table = rows();
  const repository = {
    attribute: {
      patterns: [
        {
          comment: "id=books",
          match: '([A-Za-z][\\w-]*)(=)("[^"]*"|[^\\s`]+)',
          captures: {
            1: { name: "entity.other.attribute-name.cell.hmd" },
            2: { name: "punctuation.separator.key-value.cell.hmd" },
            3: { name: "string.unquoted.attribute-value.cell.hmd" },
          },
        },
        {
          comment: "hidden",
          match: "[A-Za-z][\\w-]*",
          name: "entity.other.attribute-name.cell.hmd",
        },
      ],
    },
  };
  for (const row of table) {
    repository[`fence-${row[0]}`] = rule(row);
  }
  repository["fence-other"] = fence(ANY_NAME, null);
  return {
    $schema:
      "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
    name: "HyperMarkDown cell fences",
    comment: "Generated by syntaxes/fences.mjs. Edit that file and run it.",
    scopeName: "source.hmd.fences",
    patterns: [
      {
        begin: `(^|\\G)(?=${ANY_FENCE})`,
        end: "(?!\\G)",
        patterns: [
          ...table.map(([key]) => ({ include: `#fence-${key}` })),
          { include: "#fence-other" },
        ],
      },
    ],
    repository,
  };
}

/**
 * The `embeddedLanguages` of the card grammar in `package.json`: the body
 * scope of each rule that names a language id, and that id.
 */
export function embeddedLanguages() {
  const map = {};
  for (const [key, , , language] of BUILT_IN) {
    if (language) map[`meta.embedded.block.${key}`] = language;
  }
  return map;
}

/** The fence names of each rule, by key. */
export function names() {
  return Object.fromEntries(rows().map((row) => [row[0], row[1]]));
}

/**
 * The file's text: the frame indented, and one rule to a line, so that a new
 * language is a one-line change in a file of several hundred rules.
 */
export function text() {
  const { repository, ...frame } = grammar();
  const rules = Object.entries(repository)
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(",\n");
  const head = JSON.stringify(frame, null, 2).replace(/\n\}$/, "");
  return `${head},\n  "repository": {\n${rules}\n  }\n}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(HERE, "hmd-fences.tmLanguage.json");
  writeFileSync(out, text());
  console.log(`wrote ${out}`);
}
