# Prompt: fix issue 0010, a folder note's Markdown links resolve one directory up

You are working in the HyperMarkDown repository (this checkout). Read
`CLAUDE.md` and every file under `doc/memory/` before you start, and follow
them. In particular, progress is tracked in `doc/status/` only.

## The task

Carry out [issue 0010](0010-folder-note-links-resolve-one-level-up.md). The
MkDocs plugin registers a folder note `a/b/index.hmd` as the page `a/b.md`.
Its ordinary relative Markdown links must be resolved from the file's own
directory, then rewritten relative to the registered page. Today they are left
as written and resolve one level up.

If issue 0009 (nested vaults) is still open, work on the same branch,
`fix/nested-vault-boundary`, so both land in one patch release. Otherwise
create `fix/folder-note-links` from `main`.

## Where to work

1. In `tools/hmd/src/hypermarkdown/mkdocs_plugin.py`, `on_page_markdown` calls
   `_link_to_cards(markdown, page.file.src_uri)`. For a card, use the card's
   real directory (`self.sources[src_uri]`, made relative to `docs_dir`) to
   resolve each relative href. Then:
   - when the target is a registered card (`self.destinations`), write its
     registered page relative to the registered page's directory, as today;
   - otherwise, when the page is a folder note (registered directory differs
     from real directory), rebase the href onto the registered page's
     directory with `posixpath.relpath`, so it names the same file.
   Leave absolute URLs, scheme links, fragment-only links and masked regions
   (`scan.mask`) untouched. Handle reference-style definitions
   (`[id]: path`) as well as inline links.
2. Tests in the tool's suite: build a small site with a folder note that links
   a sibling card with code text (`` [`x`](x.hmd) ``), a sibling plain `.md`
   page, an image, and a page two levels up. Assert the built HTML's hrefs. Add
   one case where an ordinary card's links stay unchanged.
3. The VS Code preview resolves links itself. Check that it already resolves a
   folder note's relative links from the file's directory, and record a row in
   `doc/status/vsc-ext.md` only if it does not.
4. Tracking: move the issue 0010 card in `doc/issues/kanban.yaml` through
   doing to done. Add a Done entry in `doc/status/hmd.md` for the plugin, and
   remove the Broken row for this issue.
5. Version: if 0009 has not bumped it already, bump the Python package to 0.3.1
   at `tools/hmd/src/hypermarkdown/__init__.py`, and add a changelog entry.
   Do not publish anything. The maintainer releases.

## Gates

Run the gate commands the tool's guide lists (see `doc/status/hmd.md`,
section Gates), and build this repository's own site
(`uv run mkdocs build --strict`). Commit topic-wise and do not push. Report
the branch and commits when done.

## Constraints

- No attribution lines for any tool or assistant in commits or files.
- Never cite with the section or pilcrow signs. Name the section instead.
