# Publishing this repo to GitHub

The repository is already initialized and committed on branch `main`. What's left is creating the
remote and pushing. Pick whichever path fits you.

## Option A — GitHub website (no tools needed)

1. Go to <https://github.com/new>.
2. **Repository name:** `qoder-daily-claim`
3. **Description:** `Automates Qoder's daily free-credit claim on Windows.`
4. Set it to **Public**.
5. **Do not** check "Add a README", ".gitignore", or "license" — the repo already has them.
6. Click **Create repository**.
7. Copy the remote URL shown (it looks like `https://github.com/<you>/qoder-daily-claim.git`).
8. In PowerShell:

```powershell
cd C:\Users\Fazeli-PC\Documents\temp\qoder-daily-claim
git remote add origin https://github.com/<you>/qoder-daily-claim.git
git push -u origin main
```

GitHub will ask for credentials. If it asks for a password, use a **Personal Access Token**
(Settings → Developer settings → Personal access tokens → Tokens (classic) → scope `repo`),
not your account password.

## Option B — GitHub CLI (one command)

Install it once, then:

```powershell
winget install --id GitHub.cli
gh auth login
cd C:\Users\Fazeli-PC\Documents\temp\qoder-daily-claim
gh repo create qoder-daily-claim --public --source=. --remote=origin --push
```

## After the first push

### 1. Set the repository description and topics

On the repo page, click the gear next to **About**:

- **Description:** `Automates Qoder's daily free-credit claim on Windows.`
- **Topics:** `qoder` `credits` `automation` `electron` `cdp` `windows` `powershell`
- Tick **Releases**, **Packages** off; leave **Issues** on.

### 2. Check the README renders

Open the repo page and confirm:
- the language switcher line shows **English · 中文 · فارسی**,
- the code blocks are highlighted,
- the ASCII diagram renders as a code block (not broken).

### 3. Replace the placeholder

`README.md` contains `https://github.com/<your-username>/qoder-daily-claim.git` in the Install
section. Replace `<your-username>` with your real GitHub username:

```powershell
cd C:\Users\Fazeli-PC\Documents\temp\qoder-daily-claim
(Get-Content README.md) -replace '<your-username>', 'YOUR_REAL_USERNAME' | Set-Content README.md
(Get-Content docs\README.zh-CN.md) -replace '<your-username>', 'YOUR_REAL_USERNAME' | Set-Content docs\README.zh-CN.md
(Get-Content docs\README.fa.md) -replace '<your-username>', 'YOUR_REAL_USERNAME' | Set-Content docs\README.fa.md
git add -A
git commit -m "docs: use real repository URL"
git push
```

### 4. Optional: add a release

```powershell
git tag -a v1.0.0 -m "v1.0.0 - first public release"
git push origin v1.0.0
```

Then on GitHub: **Releases → Draft a new release → choose tag v1.0.0 → Publish**.

## Before you publish — a short checklist

- [ ] `git status` is clean
- [ ] No log files committed (`claim-log.txt`, `run-log.txt` are gitignored)
- [ ] No personal paths in the code — `run-claim.ps1` auto-detects Qoder
- [ ] README, Chinese, and Persian docs all present
- [ ] LICENSE present (MIT)
- [ ] You're comfortable with the disclaimer: this is unofficial and users are responsible for
      following Qoder's rules

## A note on visibility

You're publishing a tool that automates a vendor's in-app reward claim. That's a legitimate
personal-use convenience, and the README says so plainly — but be ready for:

- **Questions about ToS.** The README already states this performs the same single manual claim a
  user would, and links the official rules. Keep that framing.
- **Requests to remove it.** If Qoder asks, comply. It's their platform.
- **UI-change issues.** Expect people to file "claim control not found" when Qoder redesigns.
  The troubleshooting section covers it.

Keep the project honest and it stays useful.
