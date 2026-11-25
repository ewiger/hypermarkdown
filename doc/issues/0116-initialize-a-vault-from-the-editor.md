# 0116 — A card no vault claims should offer to make one

**Column**: todo
**Opened**: 2026-11-25
**Related**: [the extension's tracker](../status/vsc-ext.md),
[the per-card discovery card](archive/0108-vault-root-discovery-per-card.md),
[the vault boundary card](0021-specify-the-vault-directory-and-its-boundary.md),
[[hmd-lang-spec#the-namespace]], [[hmd-lang-spec#project-configuration]]

## What

A user reported this against `hypermarkdown.hmd` 0.5.2 on Windows. They opened a
`.hmd` card in a folder with no `.hmd/` directory, and the extension gave no
guidance on making a vault. They had to find the setup in the README and do it
by hand, and it went wrong in three ways:

- They created `.hmd/` after the card was open, and nothing changed until they
  ran **Rebuild Index** or reloaded the window. The extension caches vault
  discovery and does not notice a new marker.
- They ran an HQL cell first, and it failed with
  `hql: <workspace folder>: not a vault: it holds no .hmd/`. The message names
  the problem and not the fix.
- Neither the extension nor `hql` has an init command they could find.

The fix belongs in the extension. The specification already says what a vault
is: a directory that contains a `.hmd/` directory. `.hmd/config.toml` is
optional, and without it the namespace root is the vault directory itself. So
an **empty `.hmd/` directory is a complete vault**, and the extension can make
one without asking anything about configuration.

## The extension does not carry the Python `hmd`

The extension embeds the TypeScript core (`@hypermarkdown/core`) and bundles two
native binaries from the toolchain: `d2` and `hql`. It does not ship the Python
package, and it does not need an interpreter. The Python `hmd init` command
already exists and writes `.hmd/config.toml` plus the namespace root it names,
but an extension user does not have it. The extension's README still tells
them that "`hmd init` creates" the marker. The extension therefore needs its own
init. It is a single `createDirectory` call, so it does not justify a
dependency on Python.

## The README still describes the `wiki` key

The reporter suggests `wiki = "."` because 0.5.2 predates the specification
change that replaced `wiki` with `location_path`
([the rename card](archive/0023-rename-wiki-to-location-path.md)). A config
that sets `wiki` is now refused on purpose. The extension's code follows the
new rule, but its README was missed in the rename. It still says the
fallback root comes from "`wiki` from the folder's `.hmd/config.toml`, else
`doc/wiki`". The row for `hyperMarkdown.root` also still says "falling back to
`doc/wiki`". This card rewrites both, since it rewrites the README's setup text
anyway.

## The design

**Instead of an error, a button.** When a card is opened, or a cell is run,
and no vault claims the card, the extension shows a notification with a blue
primary action:

> No HyperMarkDown vault claims `card.hmd`. **Initialize Vault…**

The preview's empty state, which says the same thing today, carries the same
button. The HQL path shows it too: the extension catches the case before it
calls `hql`, so the user never sees the `not a vault` message.

**Initialize Vault… offers the places a vault can go.** A quick pick lists
every directory from the card's own directory up to the workspace folder, which
is every place where a `.hmd/` would claim this card. The list is ordered from
the outermost directory to the innermost:

- the workspace folder, the project root (marked as the default);
- `doc/`, when the card is under it (marked as the usual place for a project's
  documentation);
- every directory between it and the card;
- the card's own directory.

Opened from the command palette with no card, it offers the workspace folder
and its `doc/` directory. Each entry shows the path relative to the workspace
folder and how many `.hmd` files the new vault would claim, so a user can see
that a vault at the root also claims the cards in `examples/`.

**Confirming writes one empty directory**, `<chosen>/.hmd/`, and nothing else.
The extension writes no `config.toml`, because the defaults are the
specification's defaults. It does not write a starter card in this pass. Then
the extension forgets its cached discovery, re-indexes, and re-renders the
preview, so the card is in its vault without a reload.

**A matching command:** `HyperMarkDown: Initialize Vault`, in the command
palette and in the preview's empty state.

## Things to settle while building it

- **A nested vault.** A directory below an existing vault's namespace root is
  a valid choice and makes a nested vault, which takes its cards out of the
  enclosing namespace. The quick pick should say so when it applies. It does
  not apply in the common case, because there the card has no vault above it.
- **A refused vault.** When the nearest `.hmd/` has a refused `config.toml`,
  the card has a vault and the problem is the config. The notification should
  open the config file, not offer to create a second marker.
- **The `hyperMarkdown.root` fallback.** Today a card with no `.hmd/` above it
  still belongs to the workspace folder's fallback root, so the preview draws
  it. In that case the notification is advice, not an error, and it should not
  appear on every open. It should appear once per folder, with a
  "Don't ask again" choice stored in workspace state.
- **The cache.** Rebuilding the catalog after init fixes this path. A watcher on
  `**/.hmd` would also fix the path where a user creates the directory by hand,
  which is the first failure in the report. Decide whether this card does both.
- **Untrusted workspaces.** Creating a directory is a write to the user's
  disk. Decide whether the command is offered in Restricted Mode. Cells are not
  run there today.

## Done when

- Opening a card that no vault claims shows the notification with
  **Initialize Vault…**, at most once per folder unless the user asks again.
- Running a cell on such a card shows the same choice instead of the `hql`
  error.
- The quick pick lists the workspace folder, `doc/` when present, and every
  directory up to the card. It defaults to the workspace folder.
- Confirming creates `.hmd/` and nothing else. The card is then claimed by the
  new vault, its links resolve, and its cells run, all without a reload.
- `HyperMarkDown: Initialize Vault` is in the command palette.
- The README describes the button and the command, no longer sends extension
  users to `hmd init`, and describes the fallback root with `location_path`
  and its default `.`.
- Tests cover the candidate list (card at the root, card under `doc/`, a
  nested card, a card already under a refused vault) and the cache being
  dropped after init.

## Not in this card

- A starter `index.hmd`, and writing `location_path` from the dialog. Both are
  possible later, but an empty marker is enough to unblock a user.
- An init command in `hql`. HQL is its own project, and the extension no longer
  lets a user reach its `not a vault` message from a cell.
- Syntax highlighting, which is a separate question.
