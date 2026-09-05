# Runtime images: native CI and public distribution

2026-09-05. Guillermo approved a separate public artifact repository with **“ok”** to the
explicit publication question. The private application repository remains private. This
record concerns build/distribution acceptance, not activation of Machine-backed Agents.

## Published source and release

- Repository: <https://github.com/guillermolg00/blobot-machine-images>.
- Reviewed source: `056a3b31fa1838e16fcdd181c7c89528f7baf226`, exactly the prepared 15-file
  tree of recipes, locks, workflow and documentation. No desktop source or Agent data.
- Native CI: [run 33987159409](https://github.com/guillermolg00/blobot-machine-images/actions/runs/33987159409).
  All ten build jobs and the release-assembly job completed successfully.
- Release: [machines-20260905-1](https://github.com/guillermolg00/blobot-machine-images/releases/tag/machines-20260905-1),
  ID `383352042`, published at `2026-09-05T19:35:09Z` with 32 assets: ten archives, ten build
  receipts, ten smoke results, a download manifest and `SHA256SUMS`.

[The prepublication review](34-ci-release-review.json) checks all ten architecture/runtime
pairs, accepted smoke results, expected source commit, manifest references, asset byte counts
and SHA-256 values reported by GitHub. Downloaded receipt/manifest bytes also matched their
GitHub asset digests. Draft URLs used GitHub's temporary `untagged-*` name; the published
URLs were then checked against every final download pin.

[Published metadata](34-public-release-metadata.json) records `draft:false` and
`immutable:true`. Release immutability was enabled for this newly created artifact repository
before publication using GitHub's documented [repository API](https://docs.github.com/en/rest/repos/repos#enable-immutable-releases).
The published tag and assets are protected by the repository's immutable release mechanism,
alongside blobot's own full-byte checksum verification. The build inputs are pinned; differing
local and CI manifest IDs mean cross-host byte reproducibility is **not** claimed.

## Measured archive sizes

Bytes exported by CI, separately from engine-reported image size and actual disk allocation:

| Runtime | arm64 archive bytes | amd64 archive bytes |
| --- | ---: | ---: |
| Claude | 693,360,640 | 709,304,832 |
| Codex | 719,340,032 | 743,079,424 |
| OpenCode | 649,681,920 | 665,677,824 |
| fx | 594,126,848 | 610,527,744 |
| Cursor | 772,251,136 | 789,465,088 |

All are below the 1 GiB per-archive regression ceiling. The [download catalog](34-runtime-builds.json)
contains the complete content-derived references, public URLs, SHA-256 values and sizes.

## Anonymous download verification

The [public-release fixture](34-public-release-fixture.mjs) downloads the public manifest
without credentials and compares it byte-for-byte with the reviewed CI manifest. It downloads
each archive sequentially through core's actual `downloadVerified`, then validates its OCI and
Docker metadata with `verifyRuntimeImageArchive`. It keeps at least 2 GiB free and removes each
archive afterward, retaining only fx arm64 for a separate sbx load check.

The fx arm64 request first obtains exactly 1,048,576 bytes via an anonymous HTTP 206 response.
Core resumes from that `.part` with `Range: bytes=1048576-`, receives the expected `Content-Range`,
hashes the complete file and verifies its final byte count and progress total. No repository
token, login, cookies, engine call, runtime session or inference is used by this fixture.

The [completed results](34-public-release-fixture-results.json) report **all ten archives
passed**. Both architecture pins in all five adapters were then copied from that verified
catalog. No pin names an unpublished or locally built candidate.

After research35 released exclusive engine access, the [public-image load fixture](34-public-image-load.mjs)
and [result](34-public-image-load-results.json) loaded the actual fx arm64 release bytes through
`SbxImageStore`. Current archive validation, `sbx template load` and ready-state verification
passed in approximately 2.95 seconds. The exact template was removed afterward; readiness
returned to `not_installed` and no boxes remained. No runtime was started. The retained local
fx archive was removed after recording the successful checks.

Reproduction after building core:

```sh
BLOBOT_VERIFY_PUBLIC_IMAGES=1 node .scratch/machines/research/34-public-release-fixture.mjs \
  /absolute/path/to/reviewed/runtime-builds.json /private/tmp/unique-public-image-downloads
```

## Limits

CI validates image architecture, UID, empty home, versions and signed-out ACP startup. fx's
authentication refusal is expected; Cursor is explicitly stopped after successful initialize
when EOF does not end it. Native amd64 acceptance is Docker-based; no amd64 sbx host was tested.
Provider sign-in, mailbox delivery, egress policy, complete state preservation and production
activation remain separate requirements. The source's older Actions versions emitted Node 20
deprecation annotations while GitHub ran them on Node 24; all jobs passed.
