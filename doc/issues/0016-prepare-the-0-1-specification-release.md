# 0016 — Prepare the 0.1 specification release

**Column**: todo
**Opened**: 2026-11-22
**Related**: [the format's tracker](../status/lang.md),
[the specification](../wiki/hmd-lang-spec.hmd),
[HMD-0030](../proposals/HMD-0030/README.md),
[issue 0014](archive/0014-non-latin-headings-cannot-be-linked.md),
[issue 0015](0015-commonmark-examples-as-a-test-dataset.md),
[issue 0018](0018-validate-the-grammar.md)

## What

HyperMarkDown works in practice, and the language is small: six constructs,
four frontmatter keys, nineteen diagnostics. 0.1 is to be a real, frozen
release of the specification, not a permanent draft. 1.0 stays the later
promise of stability.

On 2026-11-22 every question holding 0.1 back was decided. What is left is
writing the decisions into the specification, making it readable, bringing
the tools into line, and tagging the release. This card collects all of it in
one place.

## Decided

Each decision with the reason in one line. The rows that carry the work are in
the format's tracker.

| Topic | Decision | Why |
| --- | --- | --- |
| Baseline | CommonMark 0.31.2, named by version and not explained | "Markdown" names a family, not a standard |
| Extras | Tables, task lists, strikethrough, footnotes, callouts, maths, and diagram cells are listed one by one in a section of the specification, marked non-normative | They come on top of CommonMark; a reader must see exactly what they are |
| CommonMark conformance | Tested against CommonMark's own examples, as a parallel track | A dataset checks what prose cannot; 0.1 does not wait on it [issue 0015] |
| Diagrams | `d2#show` and `mermaid#show` are diagram cells, drawn like HQL cells with Show in place of Run; a plain `d2` or `mermaid` fence is a listing | One rule for every fence that does something [HMD-0030] |
| Cells | The specification names the cell kinds and says their bodies are opaque to the resolver; how a tool runs or draws them is a suggestion, not a rule | The format owns which fences are cells; the tools own the behaviour |
| Underlined headings | `Setup` over `===` or `---` is a heading like `# Setup`, and addressable | The site already anchors them; the tools must agree with it |
| Heading matching | The fragment and each heading's visible text are normalised the same way and compared, as Obsidian does: NFC, case folding, punctuation dropped, letters and digits kept in every script, whitespace collapsed. The specification states the rule itself | Naming a Python library made the other implementations copy its behaviour, including its bugs [issue 0014] |
| Duplicate headings | The first wins and the linter warns; the recommended remedy is an anchor on the heading. The `_1` suffix leaves the language | Anchors are the author's controlled name |
| Heading paths | `#Chapter#Section` waits for in-card addressing | It is the first step of that grammar |
| In-card addressing | After 0.1. Its branch rebases onto the 0.1 specification and renumbers its unreleased rules from HMD020 | 0.1 stays small; addresses need both implementations and their own cases |
| Project root | Only `.hmd/` marks a root; `.git` does not | One marker, one meaning; the editor already works this way |
| Encoding | UTF-8 only; UTF-16 turned down | git treats it as binary and the tool chain reads UTF-8; newer formats went the same way |
| Byte-order mark | A leading one is ignored | It is invisible, and today it hides frontmatter |
| Line endings | `\n`, `\r\n`, or a lone `\r`, as in CommonMark | Inherited from the baseline |
| Positions | Line and column count Unicode code points from 1; an offset counts UTF-8 bytes | The three tools count differently today, and nothing noticed |
| Invalid UTF-8 | Reported as HMD019, and the file is skipped | A clear error instead of a crash |
| Card names | Compared after NFC normalisation | A link must resolve the same on macOS and Linux |
| Determinism | Stated normatively: the same tree gives the same output, whatever the file order | The format relies on it without saying so |
| Silencing diagnostics | Not in 0.1; the sentence about suppression comments goes | A syntax designed before real use is designed wrong |
| Toggles across an embed | The embedded card's own `use` toggles govern its links | It is what textual expansion already does |
| Import order | Imported search paths stay after the spine | Importing can never break a name that already resolved |
| Publication | `nav`, visibility, and HMD017 stay in the specification | It works and two implementations have it |

## Readability

The specification and the public pages are hard to read. Proposed actions,
not yet confirmed one by one:

1. Rewrite the Introduction first as a pilot of the plainer voice, then roll
   it out to the other pages.
2. Split the specification into rules and reasons: short MUST bullets, then a
   brief "Why" note.
3. Follow one example vault through the whole specification, with real lint
   output.
4. Put a glossary at the top, and drop "cards location" and "project root" as
   separate terms.
5. Remove the sentences the prose audit patched in about autodiscovery and
   wildcard imports from the Introduction, the Vision, and the Features page.
6. Say each idea once across the cover, the Introduction, and Features; cut
   the Vision's duplicated opening.
7. Fix the contradictions: the Introduction calling HMD-0001 the normative
   specification, the Features page's "two matches is an error", and its
   claim that GitHub tables are valid HyperMarkDown.
8. Cut the tutorial down to what HyperMarkDown adds, and link to CommonMark
   for the rest.
9. Check in a style card with a list of banned stock phrases.

## Steps to the release

1. **Write the decisions into the specification,** together with readability
   actions 2 to 4. Remove the line rejecting a second diagram notation.
2. **Fix the tools to match:**
   - heading matching in both implementations [issue 0014];
   - underlined headings in both scanners;
   - column and offset units in all three implementations;
   - the `.git` fallback in the Python command line;
   - diagram cells, with the `d2` fences in this repository rewritten to
     `d2#show` in the same release.
3. **Cover the rules with tests:** a corpus case for every diagnostic and
   every resolution phase, non-Latin and duplicate headings, a non-ASCII
   column, and a vault whose `wiki` is not `.`.
4. **Validate the grammar,** a separate requirement: every production
   checked against the prose, given positive and negative cases, and run
   against all three implementations. Recognised syntax, reference
   components, positions, and diagnostics are compared, independently of
   rendering [issue 0018].
5. **Correct the stale claims.** Each tracker states which specification
   version its tool conforms to.
6. **Release:**
   - date 0.1 in the language's changelog;
   - tag it;
   - give the specification a stable address;
   - update the roadmap, which still calls 1.0 the first version.

The TypeScript implementation's missing publication rule is a known gap of
that tool, listed in the release notes, not a blocker for the specification.

## Parallel tracks, not blocking 0.1

- **CommonMark's examples as a test dataset** [issue 0015], then
  differential testing across parsers, then defining the constructs over the
  CommonMark parse — a candidate for 0.2.
- **Property-based tests of the resolver's claims** over generated vaults, in
  the Python implementation.
- **A Lean model** of resolution — parked, nice to have, unparked only if a
  property test breaks a claim.
- **Mermaid's renderer** — still to be chosen [issue 0115].

## Open

- **The site's renderer does not follow CommonMark.** The site renders with
  Python-Markdown, which keeps older Markdown rules, such as four-space list
  indentation, and will likely fail many of CommonMark's examples. Once the
  baseline is declared, either the canonical renderer moves to a
  CommonMark-compliant one, or the specification says that for 0.1 only
  scanning must agree with CommonMark, and rendering is out of scope.
- **Readability actions 1 to 9** above await confirmation.

## Done when

- The specification carries every decision above, and reads in the plainer
  voice.
- All three implementations pass the corpus, including the new cases.
- Every grammar production is validated against the prose and covered by
  cases that all three implementations pass [issue 0018].
- The trackers agree with the registries and name the version they conform to.
- 0.1 is dated, tagged, and linked from the roadmap.
