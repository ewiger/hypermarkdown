"""HyperMarkDown — a strict, machine-checkable markdown dialect.

The **canonical** implementation of the format: where this and any other
implementation disagree about a case the conformance corpus covers, this one
defines the correct answer. Every consumer here (CLI, MkDocs plugin, the language
server to come) is a thin client over the same semantics.

Canonical is not sole. The old principle that semantics live in one
implementation is retired — a second implementation exists in TypeScript, and the
corpus at `examples/conformance/cases/` plus a ledger of expected failures is
what keeps the two from drifting into dialects.
"""

from .config import Config, ConfigError
from .model import Diagnostic, Document, Link, Span
from .resolve import Outcome, Resolution, Workspace

__version__ = "0.3.0"

__all__ = [
    "Config",
    "ConfigError",
    "Diagnostic",
    "Document",
    "Link",
    "Outcome",
    "Resolution",
    "Span",
    "Workspace",
    "__version__",
]
