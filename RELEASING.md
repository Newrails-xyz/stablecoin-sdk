# Releasing

Releases are driven by [Changesets](https://github.com/changesets/changesets) and run
automatically in GitHub Actions (`.github/workflows/release.yml`), authenticating with
**npm Trusted Publishing (OIDC)** — no long-lived npm token is stored in the repo.

Two public packages are published:

- `@newrailsuab/stablecoin-contracts`
- `@newrailsuab/stablecoin-core` (depends on `contracts`)

---

## One-time bootstrap (once per package)

npm only lets you configure a trusted publisher **after a package already has at least one
published version**. So each package's **first publish must be done manually from your machine
with a token**; every release after that uses OIDC.

### 1. Publish 0.1.0 locally

```bash
# Log in with an account that has publish rights to @newrailsuab
npm login

# Build from a clean state
npm ci
npm run build

# Publish in dependency order: contracts first, then core
# (publishConfig.access = public is already set in each package.json)
npm publish --workspace @newrailsuab/stablecoin-contracts
npm publish --workspace @newrailsuab/stablecoin-core
```

> The bootstrap publish has no provenance (provenance requires the CI OIDC environment and
> cannot be generated locally). That is fine.

### 2. Configure a Trusted Publisher on npmjs.com for each package

Do this once for **each of the two packages**:

1. Open the package page → **Settings** → **Trusted Publisher** → **Select your publisher: GitHub Actions**
2. Fill in:

   | Field | Value |
   |-------|-------|
   | Organization or user | `Newrails-xyz` |
   | Repository | `stablecoin-evm` |
   | Workflow filename | `release.yml` |
   | Environment name | *(leave empty)* |

3. Under **Allowed actions**, check **Allow `npm publish`** (leave `npm stage publish` unchecked),
   then click **Set up connection**.

Once configured, CI can publish the package via OIDC — **no npm token needed** from then on.

### 3. (Optional) Revoke the temporary token

The token used for the bootstrap publish is no longer needed. Revoke it under
npmjs → Access Tokens.

---

## Day-to-day release flow

After bootstrapping, releases happen entirely through PRs — no manual `publish` commands.

### 1. Attach a changeset to each PR

On your feature branch:

```bash
npx changeset
```

Follow the prompts: **which packages changed** → **major / minor / patch** → **a short summary**.
The generated `.changeset/*.md` file is committed together with the PR.

- Internal-only change that needs no release: `npx changeset --empty`
- Remember: **core depends on contracts**. If you add a changeset only for contracts, Changesets
  will automatically update core's dependency (per `updateInternalDependencies: patch`) and bump
  core with a patch.

### 2. Merge the PR into `main`

The changeset file lands on `main` — **nothing is published yet**. The release workflow detects
the pending changeset and opens (or updates) a PR titled **"Version Packages"**, in which it has
already:

- bumped each package's `version`
- synced core's dependency on contracts
- generated/appended each package's `CHANGELOG.md`
- deleted the consumed changesets

### 3. Merge the "Version Packages" PR → automatic publish

Review the version bumps and changelog, then merge it. The workflow sees there are no pending
changesets and:

- runs `npm run build`
- runs `changeset publish` in dependency order (contracts before core)
- publishes to npm with provenance and creates the git tags

---

## Notes

- **Auth**: OIDC, via the workflow's `id-token: write` permission — no `NPM_TOKEN`.
- **npm version**: trusted publishing needs npm ≥ 11.5.1; the workflow runs `npm install -g npm@latest` as a safeguard.
- **provenance**: explicitly enabled via `NPM_CONFIG_PROVENANCE=true`.
- **access level**: `access: public` in `.changeset/config.json` plus `publishConfig.access: public` in each package.
- Adding a third package? Repeat the "One-time bootstrap" above for it.
