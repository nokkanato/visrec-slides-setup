# Visrec Slides: setup instructions for AI agents

You are an AI agent. Your user asked you to set them up for **Visrec Slides**. You will install the
**Visrec Slides Kit**: a small command-line program (`vsk.mjs`, Node.js 18 or newer, no other
dependencies) that runs on the user's own computer and reads and edits Google Slides decks with the
user's **own Google account**. Their changes show under their own name in Google Slides' version
history, like edits made by hand.

Follow the steps in order. Talk to the user in plain words, **in the language they write to you in**
(Thai or English). Before each step, tell them what you are about to do and what they will see.

| | |
|---|---|
| Kit files | `https://nokkanato.github.io/visrec-slides-setup/kit/vsk.mjs`<br>`https://nokkanato.github.io/visrec-slides-setup/kit/client.json` (Google login client for the kit; public, not a secret)<br>`https://nokkanato.github.io/visrec-slides-setup/kit/KIT_GUIDE.md` (how to use the kit) |
| Install folder | `~/.visrec-slides/` (Windows: `%USERPROFILE%\.visrec-slides`) |
| Run a kit command | `node ~/.visrec-slides/vsk.mjs <command>`<br>Windows PowerShell: `node "$env:USERPROFILE\.visrec-slides\vsk.mjs" <command>`<br>Every command prints JSON. Below, `vsk` is short for this. |
| Who can use it | Anyone the deck is shared with **as Editor**. There is no list to join. |
| Starter prompts | https://nokkanato.github.io/visrec-slides-setup/prompts.md |

Rules for the whole setup:
- Never ask the user to paste a password, token or login code into the chat. Never show the
  contents of the kit's login files.
- Don't overwrite a file you didn't create. If a file already exists, tell the user what you will
  add and ask before you change it.
- When your app asks the user to approve a command, network access or writing outside the project
  folder, tell them what it is for and that they should approve it.
- If a step fails, show the user the error in plain words (and its `hint`, if the JSON has one)
  and stop. Don't work around it by changing other settings on the computer.

---

## Step 1: Check that you can run commands on this computer

Run `node -v`. Any answer counts here, even "command not found": what matters is that you can run
commands on the user's own computer. Note which shell you have (macOS / Linux / Git Bash, or
Windows PowerShell) and use the matching commands below.

Stop if you can't run commands (chat-only apps: claude.ai or Claude phone chat, ChatGPT, Gemini in a
browser or on a phone) or if you run somewhere other than the user's computer (for example Codex
cloud tasks or Claude's Cowork mode). Tell the user, in their language:

> This needs an AI app that can run programs on your computer. Please open the **Code** tab in the
> Claude desktop app (or Claude Code), the **Codex** app, or **Antigravity**, and paste the same
> line there: `Read https://nokkanato.github.io/visrec-slides-setup/agent-setup.md and set me up`

> ขั้นตอนนี้ต้องใช้แอป AI ที่รันโปรแกรมบนเครื่องของคุณได้ กรุณาเปิดแท็บ **Code** ในแอป Claude
> บนคอมพิวเตอร์ (หรือ Claude Code), แอป **Codex** หรือ **Antigravity** แล้ววางข้อความเดิมอีกครั้ง:
> `Read https://nokkanato.github.io/visrec-slides-setup/agent-setup.md and set me up`

## Step 2: Make sure Node.js 18 or newer is installed

`node -v` prints something like `v22.11.0`. 18 or higher: go to Step 3.

Missing or older:
- **macOS:** if `brew -v` works, run `brew install node` (`brew upgrade node` if Homebrew's Node is
  old). Otherwise ask the user to download the **LTS** installer (.pkg) from https://nodejs.org,
  open it and click through.
- **Windows:** run `winget install OpenJS.NodeJS.LTS`. If there is no `winget`, ask the user to
  install the **LTS** installer (.msi) from https://nodejs.org.
- **Linux:** install Node 18+ with the system package manager or from https://nodejs.org.

Tell the user their computer may ask for **their computer password** (macOS) or to click **Yes**
(Windows). That is their own computer asking, not you. Then run `node -v` again. If it is still not
found, the new Node isn't visible to this session yet: ask the user to quit and reopen the app (or
start a new session), then paste the starter line again. Steps already done are skipped quickly.

## Step 3: Download the kit

macOS / Linux / Git Bash:
```bash
mkdir -p ~/.visrec-slides && chmod 700 ~/.visrec-slides && \
curl -fsSL -o ~/.visrec-slides/vsk.mjs      https://nokkanato.github.io/visrec-slides-setup/kit/vsk.mjs && \
curl -fsSL -o ~/.visrec-slides/client.json  https://nokkanato.github.io/visrec-slides-setup/kit/client.json && \
curl -fsSL -o ~/.visrec-slides/KIT_GUIDE.md https://nokkanato.github.io/visrec-slides-setup/kit/KIT_GUIDE.md && \
chmod 600 ~/.visrec-slides/client.json && \
node ~/.visrec-slides/vsk.mjs help
```

Windows PowerShell (a folder in the user's profile is already private to them; no extra step):
```powershell
$d = "$env:USERPROFILE\.visrec-slides"; $u = "https://nokkanato.github.io/visrec-slides-setup/kit"
New-Item -ItemType Directory -Force -Path $d | Out-Null
curl.exe -fsSL -o "$d\vsk.mjs"      "$u/vsk.mjs"
curl.exe -fsSL -o "$d\client.json"  "$u/client.json"
curl.exe -fsSL -o "$d\KIT_GUIDE.md" "$u/KIT_GUIDE.md"
node "$d\vsk.mjs" help
```

`help` must print JSON with the list of commands. If a download fails or `help` doesn't work, show
the error and stop. This step needs network access and writes outside the project folder, so your
app may ask the user to approve it (Codex: running it outside the sandbox).

## Step 4: Sign in with Google

First tell the user what will happen, in their language:

> A browser window will open for Google sign-in.
> 1. Sign in with the **same Google account the deck is shared with**.
> 2. Google shows **"Google hasn't verified this app"**. That is expected for this company tool.
>    Click **Advanced**, then **Go to … (unsafe)**.
> 3. **Tick the box** that allows Google Slides, then click **Continue**.
> 4. When the browser says you're done, come back here.

> จะมีหน้าต่างเบราว์เซอร์เปิดขึ้นมาให้ล็อกอิน Google
> 1. ล็อกอินด้วย **บัญชี Google เดียวกับที่ได้รับแชร์สไลด์**
> 2. Google จะขึ้นว่า **"Google hasn't verified this app"** เป็นเรื่องปกติของเครื่องมือภายในบริษัทนี้
>    ให้กด **Advanced** แล้วกด **Go to … (unsafe)**
> 3. **ติ๊กช่อง** ที่อนุญาตให้ใช้ Google Slides แล้วกด **Continue**
> 4. เมื่อเบราว์เซอร์บอกว่าเสร็จแล้ว ให้กลับมาที่นี่

Then run:
```bash
node ~/.visrec-slides/vsk.mjs login
```
- It waits until the user finishes in the browser. Run it with a long timeout (at least 5
  minutes) and don't stop it early.
- It needs network access and opens the browser, so a sandboxed app (Codex) must run it outside the
  sandbox. The user approves.
- If no browser opens, the output says what to do (for example a link to open in the browser on
  this computer). Pass that on to the user.
- If it fails, tell the user the error's `hint` in plain words and stop. See Troubleshooting below.
- If the user didn't tick the Slides box, the kit can't edit. Run `login` again and remind them.

Then run `node ~/.visrec-slides/vsk.mjs whoami` and tell the user: "You're signed in as
name@example.com." Ask if that is the account the deck is shared with. If not: `vsk logout`, then
`vsk login` again with the right account.

## Step 5: Remember the kit for later chats

Save a short note in your own app's global memory, so you use the kit in future chats. Do only the
part for the app you are. Never overwrite existing content: if the file already exists, show the
user what you will add and ask first.

### Claude Code / Claude desktop app (Code tab)

Create the skill `~/.claude/skills/visrec-slides/SKILL.md`: frontmatter, then the full text of
`KIT_GUIDE.md`, then one line with the starter prompts link. If `SKILL.md` already exists (an
earlier setup), ask the user before replacing it.

macOS / Linux / Git Bash:
```bash
mkdir -p ~/.claude/skills/visrec-slides && {
  printf '%s\n' '---' 'name: visrec-slides' \
    'description: "Read and edit Google Slides decks with the Visrec Slides Kit (vsk). Use when the user wants to see, change, check or add to a Google Slides deck, such as a Visrec deck or a docs.google.com/presentation link (storyboards, Gantt charts, tidy layouts, pictures, footers, speaker notes)."' \
    '---' ''
  cat ~/.visrec-slides/KIT_GUIDE.md
  printf '\n%s\n' 'Starter requests and how to handle each: https://nokkanato.github.io/visrec-slides-setup/prompts.md'
} > ~/.claude/skills/visrec-slides/SKILL.md
```

Windows PowerShell:
```powershell
$s = "$env:USERPROFILE\.claude\skills\visrec-slides"
New-Item -ItemType Directory -Force -Path $s | Out-Null
$head = @('---', 'name: visrec-slides',
  'description: "Read and edit Google Slides decks with the Visrec Slides Kit (vsk). Use when the user wants to see, change, check or add to a Google Slides deck, such as a Visrec deck or a docs.google.com/presentation link (storyboards, Gantt charts, tidy layouts, pictures, footers, speaker notes)."',
  '---', '') -join "`n"
$guide = [IO.File]::ReadAllText("$env:USERPROFILE\.visrec-slides\KIT_GUIDE.md")
$tail = "`nStarter requests and how to handle each: https://nokkanato.github.io/visrec-slides-setup/prompts.md`n"
[IO.File]::WriteAllText("$s\SKILL.md", $head + "`n" + $guide + $tail)
```

The skill is active in new sessions.

### Codex (app or CLI)

Append this section to `~/.codex/AGENTS.md` (if `CODEX_HOME` is set: `$CODEX_HOME/AGENTS.md`;
Windows: `%USERPROFILE%\.codex\AGENTS.md`). Create the file if it is missing. Append, never
replace. If the file already has a "Visrec Slides Kit" section, leave it as it is.

```markdown

## Visrec Slides Kit
To read or edit Google Slides decks (Visrec decks, docs.google.com/presentation links), use the
Visrec Slides Kit: `node ~/.visrec-slides/vsk.mjs <command>` (output is JSON). Before the first
kit command in a session, read `~/.visrec-slides/KIT_GUIDE.md` and follow it. Starter requests and
how to handle each: https://nokkanato.github.io/visrec-slides-setup/prompts.md
```

On Windows, write the paths in that section as `"$env:USERPROFILE\.visrec-slides\vsk.mjs"` and
`$env:USERPROFILE\.visrec-slides\KIT_GUIDE.md`.

### Antigravity

Append the same section to `~/.gemini/GEMINI.md` (Windows: `%USERPROFILE%\.gemini\GEMINI.md`), with
the same rules as for Codex.

### Another app that can run commands

Append the same section to that app's global instructions file. If you aren't sure which file that
is, ask the user.

## Step 6: Quick test

Ask the user for a deck link (`https://docs.google.com/presentation/d/…`). Run:
```bash
node ~/.visrec-slides/vsk.mjs outline --deck "<deck link>"
```
Show a short summary: the deck's title, how many slides, and a few slide titles. Then tell the user
the setup is done: who they are signed in as, that a new chat picks up the kit (Step 5), and three
example requests from the starter prompts.

If `outline` fails with a permission or "not found" error, the deck isn't shared with the signed-in
account. Tell the user to ask the deck owner to share it with the email from `whoami` as
**Editor**. With Viewer or Commenter access, `outline` works but edits fail; they also need Editor.

## Step 7: Update or remove (when the user asks)

**Update** ("update my Visrec Slides Kit"): run the Step 3 downloads again. They replace the three
kit files; the login is kept, so no new sign-in is needed. Claude: rebuild the skill from Step 5
(it holds a copy of `KIT_GUIDE.md`, so replacing it is expected here; tell the user). Codex and
Antigravity: nothing to change, their section points at the file. Run `vsk help` and `vsk whoami`
to check.

**Remove** ("remove the Visrec Slides Kit"): tell the user what you will delete, ask OK, then:
1. `node ~/.visrec-slides/vsk.mjs logout`
2. Delete the folder: `rm -rf ~/.visrec-slides`
   (PowerShell: `Remove-Item -Recurse -Force "$env:USERPROFILE\.visrec-slides"`).
3. Claude: delete the folder `~/.claude/skills/visrec-slides/`. Codex / Antigravity: remove only the
   "Visrec Slides Kit" section from `AGENTS.md` / `GEMINI.md` and keep everything else.
4. Tell the user they can also remove the kit's access at https://myaccount.google.com/connections.

---

## How to work on the deck after setup

Use the commands as `KIT_GUIDE.md` describes. Playbooks for 30 common requests:
**https://nokkanato.github.io/visrec-slides-setup/prompts.md**

1. **Vague request** ("do a storyboard"): ask ONE short question first (which content or slides,
   and what input: brief, script, dates). Don't guess the content.
2. **Copy the deck's own look**: make new slides with `dup` from an existing slide of the same
   kind, then change the text. Never invent a new style.
3. **One slide first**: do one, `thumb` it, look at the picture, show the user, then do the rest.
4. **Thai text runs longer and taller**: `thumb` every changed slide and fix text that doesn't fit,
   overlaps or runs off the slide.
5. **Other people work in the same deck at the same time**, and the kit can change any slide the
   user can. Change only the slides the user asked about. Before anything that touches other
   slides (`replace` without `--slide`, `move-slide`, `del`), list what will change and ask "OK?".
6. **Use ids, not slide numbers.** Numbers move when anyone adds or deletes a slide. Run `outline`
   again when unsure.
7. **Who changed what** is in Google Slides → File → Version history. The kit can't read it.
8. Reply in the user's language (Thai or English).

---

## Troubleshooting

| What you see | What it means | What to tell the user |
|---|---|---|
| `node: command not found` / `'node' is not recognized` | Node.js is missing, or was just installed and this session can't see it yet | Step 2. After installing, quit and reopen the app, then paste the starter line again. |
| A download fails (404, could not resolve host, blocked) | no network permission, or the kit files aren't reachable | Approve network access when the app asks. If it still fails, send the error to the person who gave you this page. |
| "Google hasn't verified this app" | expected for this company tool | Click **Advanced** → **Go to … (unsafe)** → tick the Slides box → **Continue**. |
| "Access blocked", "This app is blocked", `admin_policy_enforced` | the user's company Google admin blocks outside apps for that account | Use another Google account (for example a personal Gmail) and ask the deck owner to share the deck with that one, or ask the company's IT admin. |
| `access_denied`, or the browser was closed | the user clicked Cancel or closed the window | Run `vsk login` again. |
| Login says the Slides permission is missing | the Slides box wasn't ticked | Run `vsk login` again and tick the box. |
| Permission denied / "not found" for a deck | the deck isn't shared with the signed-in account, or only as Viewer/Commenter | Check `vsk whoami`. Ask the deck owner to share the deck with that email as **Editor**. |
| Wrong Google account | signed in with a different account | `vsk logout`, then `vsk login` with the right one. |
| Token expired / `invalid_grant` | the saved login no longer works (for example the user removed access in their Google account) | Run `vsk login` again. |
| An element or slide id is suddenly "not found" | someone else changed or deleted it a moment ago | Run `outline` / `read` again and continue with the new ids. |
| A picture link fails | the link opens a web page, is private, or blocks downloads | Use the link of the picture itself, or download it and use `image --file`. |
| "WebP" / "HEIC" / "SVG" / picture too big | the picture type isn't supported, or it is too large | Convert to PNG or JPEG (macOS: `sips -s format png in.heic --out out.png`) or make it smaller. |
