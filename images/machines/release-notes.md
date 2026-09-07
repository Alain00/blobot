Pinned Linux runtime images for arm64 and amd64. Each archive contains one runtime and its
required ACP bridge, based on the Docker shell template identified in its build receipt.

CI checks UID 1000, an empty home, the pinned CLI version and signed-out ACP startup with no
network. fx requires authentication for ACP initialize; no sign-in or inference is performed.
These checks do not establish sbx mailbox delivery, provider sign-in, paid turns or state
migration acceptance. Runtime traffic follows the accepted open Internet/host/LAN reach under
the harness's own restrictions; there is no pending Blobot destination allowlist. Post-creation
resizing and automatic image migration remain deferred.

Review the receipts and smoke results before publishing this draft. Published archives must
remain immutable. Verify anonymous downloads, then copy `runtime-builds.json` into the matching
adapter image definitions in a separate reviewed change. Private releases are not anonymously
downloadable; the app does not carry a repository token. No automatic image upgrade is enabled.
Record the public publisher, exact source commit, successful native CI run and publisher write
access with the adapter-pin update; this source workflow releases into its own repository.
