# 0013 — The roadmap is behind the releases, and it is the one page that states them

**Column**: todo
**Opened**: 2026-11-22
**Found by**: rebuilding the cover, which sends a reader to the roadmap for
every version and states none itself

## What

[The roadmap](../public/roadmap.md) is the only page on the site that carries
version numbers and release news. It has not been brought forward since
2026-11-13:

- **The version table** lists `hmd` 0.3.0, `@hypermarkdown/core` 0.1.1, the
  extension 0.4.3 and `hql` 0.6.0. The manifests in this repository say `hmd`
  0.4.0, the core 0.3.0, and the extension 0.5.1 shipping `hql` 0.7.1.
- **Two tools have no row**: the Rust crate `hypermarkdown` and
  `hmd-semantics`.
- **The news stops at extension 0.4.3.** Markdown cards, the extension's 0.5
  line, the Rust crate and the semantic index are not there.
- **"Cards as notebooks" sits under "What is coming"**, while the same page
  lists running cells under "What works today". The section mixes what is
  released with what is planned.
- **"Linking across repositories" and "Your editor, not just VS Code"** have
  not been read against the trackers since they were written.

On 2026-11-22 a section was added saying where the work goes: the language
specification's first version and the editor's presentation here, AI and
knowledge-graph querying in HQL. The rest of the page was left as it was.

## Shape

- Check every version and date against the registry it names (PyPI, npm,
  crates.io, the Marketplace, Open VSX), not against a manifest or another
  page. A manifest says what the next release will be called.
- Add the missing rows and the missing news entries, newest first.
- Split "Cards as notebooks" into what works and what is planned, and keep the
  planned list of generated cells.
- Read "What is coming" against `doc/status/` and drop or restate anything the
  trackers no longer plan.
- Keep the page in the site's register: features a reader can use, dates and
  not adjectives, nothing about how the tools are built.

## Done when

- Every row of the version table matches its registry on the day of the edit.
- A tool that is published has a row; a release since 2026-11-13 has a news
  entry.
- No feature is listed both as working and as coming.
- `uv run mkdocs build --strict` passes.
