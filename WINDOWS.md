# Windows development setup

## Requirements

- Node.js 22.18 or newer (the recommended version is recorded in `.nvmrc`)
- pnpm 11.9.0

## First-time setup

Open PowerShell in the project directory and run:

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm.cmd install --frozen-lockfile
Copy-Item .env.example .env.local -ErrorAction Ignore
pnpm.cmd run dev
```

Then open <http://localhost:3000>.

Set `ACCOUNT_DATA_ENCRYPTION_KEY` in `.env.local` to a random value containing at
least 24 characters. Keep that value stable so that saved account API keys remain
decryptable.

## PowerShell execution-policy note

On machines where PowerShell blocks `pnpm.ps1`, use `pnpm.cmd` as shown above.
This does not require changing the system execution policy. The application scripts
are cross-platform and work on both Windows and Unix-like systems.

## Verification

```powershell
pnpm.cmd run lint
pnpm.cmd test
```
