"""The `hmd` command-line interface (HMD-0001 §7).

All semantics live in the library; this layer is argument parsing and
formatting only, so a future `hmd lsp` answers from the same code rather than
from a second reading of the specification.

Exit codes are pinned: 0 clean, 1 diagnostics, 2 usage or internal failure.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer

from . import __version__
from . import config as config_mod
from . import graph as graph_mod
from .lint import check, format_json, format_text, summarize
from .model import Diagnostic
from .render import flat
from .resolve import SUFFIX, Workspace

app = typer.Typer(
    add_completion=False,
    help="Lint, query, and inspect a HyperMarkDown knowledge base.",
    no_args_is_help=True,
)

EXIT_OK = 0
EXIT_DIAGNOSTICS = 1
EXIT_USAGE = 2

RootOption = typer.Option(None, "--root", help="Namespace root (default: the `wiki` setting, or doc/wiki).")
FormatOption = typer.Option("text", "--format", help="Output format: text or json.")


def _show_version(value: bool) -> None:
    """Report the module's version, not the installed distribution's.

    `importlib.metadata` would answer for the wheel on the path, which is the
    wrong answer in a checkout — the number a contributor is about to tag lives
    in `__init__.py`, and `hmd --version` should show that one.
    """
    if value:
        typer.echo(f"hmd {__version__}")
        raise typer.Exit(EXIT_OK)


@app.callback()
def cli(
    version: bool = typer.Option(
        False,
        "--version",
        callback=_show_version,
        is_eager=True,
        help="Show the version and exit.",
    ),
) -> None:
    """Lint, query, and inspect a HyperMarkDown knowledge base."""


def _workspace(root: Optional[Path], start: Path | None = None) -> Workspace:
    try:
        cfg = config_mod.load(root_override=root, start=start)
    except config_mod.ConfigError as exc:
        typer.echo(f"hmd: {exc}", err=True)
        raise typer.Exit(EXIT_USAGE)
    return Workspace(cfg)


def _selected(workspace: Workspace, paths: list[Path] | None) -> list[Path] | None:
    """Map CLI paths onto pages in the workspace, or None for the whole tree."""
    if not paths:
        return None
    selected: list[Path] = []
    for raw in paths:
        candidate = raw.resolve()
        if candidate.is_dir():
            selected.extend(p for p in workspace.pages() if candidate in p.parents or candidate == p.parent)
        elif candidate.suffix == SUFFIX:
            if candidate not in workspace.documents:
                typer.echo(f"hmd: not inside the namespace root: {raw}", err=True)
                raise typer.Exit(EXIT_USAGE)
            selected.append(candidate)
        else:
            typer.echo(f"hmd: not a {SUFFIX} file or directory: {raw}", err=True)
            raise typer.Exit(EXIT_USAGE)
    return sorted(set(selected))


@app.command()
def init(
    path: Optional[Path] = typer.Argument(None, help="Project root to initialise (default: the working directory)."),
    wiki: str = typer.Option(config_mod.DEFAULT_WIKI, "--wiki", help="Namespace root, relative to the project root."),
    name: Optional[str] = typer.Option(None, "--name", help="Namespace name (default: the project directory's name)."),
    force: bool = typer.Option(False, "--force", help="Replace an existing .hmd/config.toml."),
) -> None:
    """Create `.hmd/config.toml` and the namespace root it names."""
    try:
        result = config_mod.init(path, wiki=wiki, name=name, force=force)
    except config_mod.ConfigError as exc:
        typer.echo(f"hmd: {exc}", err=True)
        raise typer.Exit(EXIT_USAGE)

    def note(target: Path) -> str:
        if target in result.created:
            return " (created)"
        if target == result.config and result.overwritten:
            return " (replaced)"
        return " (already there)"

    typer.echo(f"project:   {result.project}{note(result.project)}")
    typer.echo(f"config:    {result.config}{note(result.config)}")
    typer.echo(f"wiki:      {result.wiki}{note(result.wiki)}")
    typer.echo(
        f"namespace: {result.name} ({result.provider})"
        f"{' — from the directory name' if result.derived_name else ''}"
    )

    if result.enclosing is not None:
        typer.echo(
            f"hmd: note: {result.enclosing} is already a project root, and the nearer "
            f"marker wins — cards under {result.project} now resolve against the new root.",
            err=True,
        )
    raise typer.Exit(EXIT_OK)


@app.command()
def lint(
    paths: Optional[list[Path]] = typer.Argument(None, help="Files or directories; default is the whole tree."),
    root: Optional[Path] = RootOption,
    output_format: str = FormatOption,
    strict: bool = typer.Option(False, "--strict", help="Count warnings as errors."),
) -> None:
    """Parse, resolve, and report. The MVP's primary command."""
    if output_format not in ("text", "json"):
        typer.echo(f"hmd: unknown format {output_format!r} (expected text or json)", err=True)
        raise typer.Exit(EXIT_USAGE)

    workspace = _workspace(root)
    diagnostics = check(workspace, _selected(workspace, paths))

    render = format_json if output_format == "json" else format_text
    typer.echo(render(diagnostics, strict))

    errors, _ = summarize(diagnostics, strict)
    raise typer.Exit(EXIT_DIAGNOSTICS if errors else EXIT_OK)


@app.command()
def graph(
    root: Optional[Path] = RootOption,
    output_format: str = typer.Option("json", "--format", help="Output format: json."),
) -> None:
    """Dump the resolved graph."""
    if output_format != "json":
        typer.echo(f"hmd: graph supports --format json only, got {output_format!r}", err=True)
        raise typer.Exit(EXIT_USAGE)
    typer.echo(graph_mod.to_json(_workspace(root)))


@app.command()
def render(
    path: Path = typer.Argument(..., help="The card to render."),
    root: Optional[Path] = RootOption,
    to: str = typer.Option("markdown", "--to", help="Output format: markdown or html."),
) -> None:
    """Expand embeds and rewrite resolved links.

    Flat markdown is a one-way build product; it does not round-trip back into
    `.hmd`.
    """
    if to not in ("markdown", "html"):
        typer.echo(f"hmd: unknown target {to!r} (expected markdown or html)", err=True)
        raise typer.Exit(EXIT_USAGE)

    workspace = _workspace(root)
    target = path.resolve()
    if target not in workspace.documents:
        typer.echo(f"hmd: not a page inside the namespace root: {path}", err=True)
        raise typer.Exit(EXIT_USAGE)

    result = flat.to_html(workspace, target) if to == "html" else flat.render(workspace, target)
    typer.echo(result.text)

    for diagnostic in sorted(result.diagnostics, key=Diagnostic.sort_key):
        typer.echo(
            f"{diagnostic.path}:{diagnostic.line}:{diagnostic.column}: "
            f"{diagnostic.severity}[{diagnostic.rule}] {diagnostic.message}",
            err=True,
        )
    raise typer.Exit(EXIT_DIAGNOSTICS if result.diagnostics else EXIT_OK)


@app.command()
def info(root: Optional[Path] = RootOption) -> None:
    """Show the resolved root and discovery policy."""
    workspace = _workspace(root)
    cfg = workspace.config
    typer.echo(f"root:          {cfg.root}")
    typer.echo(f"config:        {cfg.source or '(none — using defaults)'}")
    typer.echo(f"autodiscovery: {cfg.autodiscovery}")
    typer.echo(f"mode:          {cfg.mode}")
    typer.echo(f"pages:         {len(workspace.pages())}")


def main() -> None:  # pragma: no cover - console-script shim
    app()


if __name__ == "__main__":  # pragma: no cover
    main()
