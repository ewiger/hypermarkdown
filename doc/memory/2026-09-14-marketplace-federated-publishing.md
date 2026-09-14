# 2026-09-14 — the gallery publishes with no stored credential

How `hypermarkdown.hmd` came to be published to the VS Marketplace from CI
without a token, and the three things that cost time getting there. None of it
is derivable from the workflows, which show only the arrangement that won.

Progress is not tracked here — E8.4 and E9.5 are closed in
[`doc/vsc-ext/STATUS.md`](../vsc-ext/STATUS.md).

## Two credentials died before this one

**Trusted publishing (`--oidc`) never shipped.** microsoft/vsmarketplace#1422
has been open since August 2025, the gallery exposes no policy UI, and the flag
is in no released `vsce` — 3.9.2 offers `--pat` and `--azure-credential` and
nothing else. The job that waited for it pinned the single prerelease that
carried the flag, so "flip a variable to enable, no code change" had quietly
stopped being true long before anyone tried it.

**A PAT never published anything.** Two runs died on `Request timeout:
/_apis/gallery`, and recreating the token changed nothing. It was a bridge to
2026-12-01 anyway, when global PATs — the "all accessible organizations" scope
the Marketplace requires — stop working. It carried nothing across and was
deleted.

## What was actually blocking `--azure-credential` was a grant, not tooling

`vsce` builds a `ChainedTokenCredential` and asks it for the Azure DevOps scope.
Any Azure session in the job satisfies that. The gallery then answers
`InvalidAccessException: The requested operation is not allowed` unless the
*exact principal asking* is a member of the publisher.

The grant is keyed on an Azure DevOps **profile id**. The publisher's
Members → Add search accepts nothing else — not a client id, not an object id,
not a resource id — and a profile id can only be read by querying Azure DevOps
*as* the identity in question, which is why learning CI's required running a
throwaway workflow that signed in as it and asked. That workflow is deleted; it
existed to produce one GUID.

Two identities, two grants, and the second does not follow from the first: the
human user (`efc7739e-1734-680b-ba81-b84cd049c2e5`) was granted Contributor
first and published `0.2.0 darwin-arm64` by hand in seconds, which proved the
mechanism and proved nothing about CI. The app registration
`hypermarkdown-vsce-publish` (`ddea9a06-…`, profile id `3e09813b-…`) needed its
own.

## Why an app registration rather than a managed identity

Only two Entra object types accept federated credentials: app registrations and
user-assigned managed identities. Not users, not groups — which is the whole
reason CI cannot simply be the human without storing the human's credentials,
the exact thing this removes.

Microsoft documents only the Azure Pipelines route, through a user-assigned
managed identity. From GitHub the app registration federates directly and no
managed identity is needed. It is also the better object here: a managed
identity lives in a resource group and dies with the subscription, while an app
registration lives in the directory and outlives `Azure subscription 1`
entirely. Hence `allow-no-subscriptions` — the job never selects one because it
has nothing to select. Both are free; Entra Workload ID Premium is the paid SKU
and is not involved.

The app carries **no client secret and no certificate**, so nothing expires and
nothing rotates.

## `azure/login@v2` is required, not decoration

`EnvironmentCredential` is first in `vsce`'s chain and does **not** read
`AZURE_FEDERATED_TOKEN_FILE`, so handing the job a bare federated token gets it
nowhere. `azure/login` performs the OIDC `az login` itself and
`AzureCliCredential`, next in the chain, picks the session up.

## The subject is the immutable form

The first CI run failed with:

```
AADSTS700213: No matching federated identity record found for presented
assertion subject 'repo:ewiger@394998/hypermarkdown@1317765500:environment:vscode-marketplace'
```

This repository has `use_immutable_subject` on, so GitHub qualifies the owner
and repository with their numeric ids. A credential registered against the
plain `repo:<owner>/<repo>` spelling is never matched. Both spellings are
registered on the app, so the setting can be flipped either way without a dead
pipeline, and `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`
reports which is live.

The ID-qualified form is the better one to be on: it survives a rename of the
owner or the repository, where the plain form silently stops matching. That is
the point of the feature, and the failure mode it prevents is worse than the one
it caused — a rename would have broken publishing with no error until the next
release.

Note that the error names the subject it received, so it carries its own fix.

## Reading the gallery: `flags: 1073` lies

For most of 2026-09-14 the release was believed to be `darwin-arm64` only, and
the plan for the day was written around rescuing five missing targets. All six
had been live the whole time.

The `extensionquery` recipe in circulation passes `flags: 1073`, which sets
`ExcludeNonValidated`. A package still in validation is therefore **absent from
the response** rather than reported as pending, and absent reads identically to
never uploaded. Use `flags: 17` — `IncludeVersions` plus
`IncludeVersionProperties` — which lists every target and the state of each.

Open VSX has the mirror-image trap: its plain `/versions` endpoint serves a
stale CDN copy, so add a cache buster before concluding anything is missing.

Trust the gallery API over `vsce`'s own output either way.

## The retry loop stays, and the acceptance run did not earn its removal

`publish-marketplace.yml` uploads one package per `vsce` invocation with
retries, added when PAT uploads timed out and took all six down together. The
run that proved the federated credential was green in 45 seconds with no
retries — but every package answered `Version 0.2.0 is already published.
Skipping publish.`, because `--skip-duplicate` did its job.

So nothing pushed 18 MB, and the run says nothing about whether the timeout is
gone. It proves authorization — reaching that answer requires an authorized
principal, and `InvalidAccessException` is what used to come back instead. The
loop collapses to a single `vsce publish` only after a run that genuinely
uploads six packages.
