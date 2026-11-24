# 0018 — Validate the grammar

**Column**: done
**Opened**: 2026-11-24
**Related**: [the format's tracker](../status/lang.md),
[the release card](0016-prepare-the-0-1-specification-release.md),
[[hmd-lang-spec#grammar]], [[hmd-lang-spec#lexical-model]],
[the conformance corpus](../../examples/conformance/README.md)

## What

A release requirement for 0.1, kept separate from the specification's prose
and from the corpus that exists today.

The *Grammar* section states the format's constructs as productions, and the
prose around them adds rules the productions do not express. Nothing checks
that the productions and the prose say the same thing. Nothing checks either
that the three implementations recognise what the productions admit and reject
what they exclude.

The corpus cannot show this today. Each case is a whole tree, and
`expected.json` holds only diagnostics and resolutions. What the scanner
recognised, how it split a reference into its parts, and where each part sits
in the source are never compared. The Rust runner compares resolutions only.
A grammar disagreement is visible only when it happens to change a diagnostic
or a resolution.

## Scope

Every production in *Grammar*: `embed`, `wikilink`, `target`, `page_ref`,
`absolute`, `relative`, `path_component`, `unqualified`, `bare_name`,
`unqualified_path`, `segment`, `reserved`, `fragment`, `heading_text`,
`heading_first`, `heading_char`, `block_id`, and `display`. Also the syntax
defined in prose: *Block anchors*, *Frontmatter block*, and the masked regions
of *Lexical model*, since masking decides what is recognised at all.

Rendering is out of scope.

## Steps

1. **Validate every production against the normative prose.** For each one,
   record whether the production and the prose around it agree. Record each
   rule the prose adds that the production does not express, such as a
   non-empty `heading_text`, a non-empty `display`, or the stripped card
   extension.
2. **Write language-neutral positive and negative cases for every
   production**, including the boundaries: each reserved character in each
   position, empty components, `./` and `../` alone, the length limit of
   `block_id`, and a construct inside and beside each excluded region. Cover
   in particular:
   - absolute, explicit relative, and unqualified references;
   - `.` and `..` as path components, and multi-component paths;
   - backslashes, colons, and the delimiters, which the grammar does not
     reserve or reserves only in part;
   - explicit and implicit card extensions;
   - heading fragments and block identifiers;
   - valid and malformed display text;
   - Unicode: NFC normalisation of names, and source positions in code points;
   - invalid syntax: whether it is recognised, rejected, and diagnosed.
3. **Run the same cases against Python, TypeScript, and Rust.**
4. **Compare, independently of rendering:**
   - the syntax recognised: which construct, or none;
   - the parsed reference components: the kind of page reference, its path
     components, the card extension, the fragment kind and text, and the
     display;
   - source positions: the byte offsets, line, and code-point column of each
     construct;
   - diagnostics, HMD010 in particular.
5. **Report each discrepancy** between the grammar, the prose, and an
   implementation's behaviour, and record which one is wrong. Correct an
   implementation to match the standard. Never change the standard quietly
   to match one implementation: a change to the grammar or the prose is a
   decision, made in review and recorded in the tracker.

## Decided for 0.1

- **Expected output is written from the specification**, never generated from
  an implementation. The specification is the authority over every
  implementation, the canonical one included.
- **Grammar cases use the existing tree-case format and runners**:
  `examples/conformance/cases/grammar-*/`, with `expected.json` holding
  diagnostics and resolutions. There is no new kind of case and no new scan
  interface in 0.1, so no new logic.

## Limitations (known gaps)

- **Parse-level output is not compared.** The tree-case format has no place
  for the parsed components of a reference — the kind of page reference, its
  path components, the extension, the fragment kind and text, and the display —
  or for the span of a construct other than a diagnostic's line and column.
  A grammar disagreement is caught only when it changes a diagnostic, a
  resolution, or the raw text of a recognised link. A corpus format for
  parse-level output is deferred past 0.1.
- **The Rust crate compares resolutions only**, so it takes part in a grammar
  case only through which links it recognises and where they resolve.

## Done when

- Every production has a recorded verdict against the prose, and every
  disagreement found is corrected.
- Every production that agrees with the prose, and every gap the specification
  settles, has positive and negative cases in the corpus. The malformed-link
  cases follow once the rule for a malformed link is in the specification.
- All three implementations pass those cases on diagnostics and resolutions;
  the Rust crate on resolutions. Any remaining difference is a ledger entry
  that says where it is tracked.

## Closed

Closed on 2026-11-24, with every criterion under *Done when* met.

**Verdicts.** Every production in *Grammar*, and the syntax defined in prose
under *Block anchors*, *Frontmatter block*, and *Lexical model*, was checked
against the text around it. Each disagreement found went to the user as a
decision, and each is now settled in the specification:

- `:` and `\` are reserved, `\` anywhere in a wikilink;
- `.` and `..` are allowed only in explicit relative references;
- a trailing `/` names a directory, and `[[/]]` is the root's folder note;
- a link candidate is defined, and an unclosed `[[` is text;
- `#` and `^` in heading text, and a blank heading or display, are HMD010;
- a line ending is defined;
- the grammar and the `import` grammar are written in ABNF;
- spaces or tabs come before a block anchor and may follow it, and its
  position starts at the `^`;
- a block identifier matches exactly, case included;
- the frontmatter boundaries are defined;
- whitespace around a page reference is trimmed.

**Cases.** Each one is written from the text, never generated, and passes in
Python, TypeScript, and Rust (Rust on resolutions):

- `grammar-reference-forms`
- `grammar-display`
- `grammar-block-ids`
- `grammar-duplicate-anchors`
- `grammar-anchor-trailing-blanks`
- `grammar-fences`
- `grammar-code-spans-and-comments`
- `grammar-line-endings`
- `grammar-frontmatter-position`
- `frontmatter-boundaries`
- `grammar-malformed-links`
- `grammar-unclosed-brackets`
- `grammar-heading-hash-caret`
- `grammar-dots`
- `grammar-backslash`
- `grammar-page-ref-whitespace`
- `grammar-directory-references`
- `heading-text-markup`
- `heading-empty-identifiers`
- `import-statement-spacing`
- `import-keywords-case`

No ledger lists any of them.

**What the implementations got wrong, now fixed:**

- `:` was not reserved;
- `\` was not refused;
- an unclosed `[[` was HMD010;
- an import's `WS` took any Unicode whitespace, and an imported name took
  reserved characters;
- an anchor's position started at its blanks;
- a trailing `/` was dropped, so `[[m/]]` reached `m.hmd`, and `[[/]]`
  resolved to nothing;
- the cycle check followed embeds outside the embedded section.

**Left elsewhere, not here:**

- parse-level output (reference components, and spans other than a
  diagnostic's position), deferred past 0.1, as *Limitations* says;
- the CommonMark edges of the excluded regions, in issue 0019;
- symbolic links, in issue 0024.
