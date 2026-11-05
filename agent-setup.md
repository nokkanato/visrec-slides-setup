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
| Kit files (public) | `https://nokkanato.github.io/visrec-slides-setup/kit/vsk.mjs` (the kit)<br>`https://nokkanato.github.io/visrec-slides-setup/kit/KIT_GUIDE.md` (how to use it)<br>`https://nokkanato.github.io/visrec-slides-setup/kit/VERSION` (latest version number) |
| Login file (private) | `client.json`: the kit's Google login file. It is **not** on this site. Nok, the deck owner, sends it to each person privately (for example in LINE). |
| Install folder | `~/.visrec-slides/` (Windows: `%USERPROFILE%\.visrec-slides`) |
| Run a kit command | `node ~/.visrec-slides/vsk.mjs <command>`<br>Windows PowerShell: `node "$env:USERPROFILE\.visrec-slides\vsk.mjs" <command>`<br>Below, `vsk` is short for this. |
| Who can use it | Anyone the deck is shared with **as Editor** who has the login file from Nok. |
| Starter prompts | https://nokkanato.github.io/visrec-slides-setup/prompts.md |

Rules for the whole setup:
- The login file `client.json` is private. Copy it as a file only. Never open, print, show, paste
  or upload its contents, never ask the user to paste it into the chat, and never put it anywhere
  except the install folder.
- Never ask the user to paste a password, token or login code into the chat. Never show the
  contents of the kit's login files (`client.json`, `token.json`).
- Don't overwrite a file you didn't create. If a file already exists, tell the user what you will
  add and ask before you change it.
- When your app asks the user to approve a command, network access or writing outside the project
  folder, tell them what it is for and that they should approve it.
- If a step fails, show the user the error in plain words (and its `hint`, if there is one) and
  stop. Don't work around it by changing other settings on the computer.

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

This downloads the two public kit files. The login file comes in Step 4.

macOS / Linux / Git Bash:
```bash
mkdir -p ~/.visrec-slides && chmod 700 ~/.visrec-slides && \
curl -fsSL -o ~/.visrec-slides/vsk.mjs      https://nokkanato.github.io/visrec-slides-setup/kit/vsk.mjs && \
curl -fsSL -o ~/.visrec-slides/KIT_GUIDE.md https://nokkanato.github.io/visrec-slides-setup/kit/KIT_GUIDE.md && \
node ~/.visrec-slides/vsk.mjs version
```

Windows PowerShell (a folder in the user's profile is already private to them; no extra step):
```powershell
$d = "$env:USERPROFILE\.visrec-slides"; $u = "https://nokkanato.github.io/visrec-slides-setup/kit"
New-Item -ItemType Directory -Force -Path $d | Out-Null
curl.exe -fsSL -o "$d\vsk.mjs"      "$u/vsk.mjs"
curl.exe -fsSL -o "$d\KIT_GUIDE.md" "$u/KIT_GUIDE.md"
node "$d\vsk.mjs" version
```

`version` must print JSON like `{"version": "0.1.0"}`. (`vsk help` prints the command list as
plain text, not JSON; every other command prints JSON.) If a download fails or `version` doesn't
work, show the error and stop. This step needs network access and writes outside the project
folder, so your app may ask the user to approve it (Codex: running it outside the sandbox).

## Step 4: Put the login file in place

The kit needs the login file `client.json`, which Nok sends each person privately. It is not on
this site.

If `~/.visrec-slides/client.json` already exists (an earlier setup), skip this step. Check with
`test -f ~/.visrec-slides/client.json && echo yes` (PowerShell:
`Test-Path "$env:USERPROFILE\.visrec-slides\client.json"`). Don't open the file.

Otherwise ask the user, in their language:

> Please give me the Visrec Slides login file Nok sent you (a small file called `client.json`,
> usually in your **Downloads** folder if you saved it from LINE). Drag the file into this chat,
> or tell me where it is. Please don't copy its text into the chat.

> ขอไฟล์ล็อกอิน Visrec Slides ที่ Nok ส่งให้หน่อย (ไฟล์เล็กๆ ชื่อ `client.json` ถ้าบันทึกจาก LINE
> มักอยู่ในโฟลเดอร์ **Downloads**) ลากไฟล์มาวางในแชตนี้ หรือบอกว่าไฟล์อยู่ที่ไหน
> ไม่ต้องคัดลอกข้อความในไฟล์มาวางในแชต

- If they drag the file in, use its path. If your app shows you the file only as an attachment
  without a path, don't use its text: ask the user where the file is saved instead.
- If they say "Downloads", list the newest `.json` file **names** there (names only, never the
  contents): `ls -t ~/Downloads/*.json | head -5` (PowerShell:
  `Get-ChildItem "$env:USERPROFILE\Downloads\*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name`).
  Pick `client.json` (LINE may save it as `client (1).json` or similar). If it isn't clear which
  one, ask the user.
- If they don't have it, tell them to ask Nok for **"the Visrec Slides login file"**
  (Thai: **"ไฟล์ล็อกอิน Visrec Slides"**), save it, and come back. Stop here until they have it.

Copy it into the install folder (replace `<path>` with the file's full path):

macOS / Linux / Git Bash:
```bash
cp "<path>" ~/.visrec-slides/client.json && chmod 600 ~/.visrec-slides/client.json
```

Windows PowerShell:
```powershell
Copy-Item -LiteralPath "<path>" -Destination "$env:USERPROFILE\.visrec-slides\client.json"
```

Don't check the file by reading it: `login` in Step 5 checks it and says plainly if it is the wrong
file. Tell the user they can delete the copy in Downloads afterwards if they like.

## Step 5: Sign in with Google

First tell the user what will happen, in their language:

> A browser window will open for Google sign-in.
> 1. Sign in with the **same Google account the deck is shared with**.
> 2. Google shows **"Google hasn't verified this app"**. That is expected for this company tool.
>    Click **Advanced**, then **Go to … (unsafe)**.
> 3. Google asks to let the kit use **Google Slides** and **the Google Drive files it uses**.
>    **Tick every box** (or **Select all**), then click **Continue**.
> 4. When the browser says **"Signed in. You can close this tab"**, come back here.

> จะมีหน้าต่างเบราว์เซอร์เปิดขึ้นมาให้ล็อกอิน Google
> 1. ล็อกอินด้วย **บัญชี Google เดียวกับที่ได้รับแชร์สไลด์**
> 2. Google จะขึ้นว่า **"Google hasn't verified this app"** เป็นเรื่องปกติของเครื่องมือภายในบริษัทนี้
>    ให้กด **Advanced** แล้วกด **Go to … (unsafe)**
> 3. Google จะขออนุญาตให้ใช้ **Google Slides** และ **ไฟล์ใน Google Drive ที่แอปนี้ใช้**
>    **ติ๊กทุกช่อง** (หรือ **Select all**) แล้วกด **Continue**
> 4. เมื่อเบราว์เซอร์ขึ้นว่า **"Signed in. You can close this tab"** ให้กลับมาที่นี่

Then run:
```bash
node ~/.visrec-slides/vsk.mjs login
```
- It prints a sign-in link, opens the browser, then **waits up to 5 minutes** for the user to
  finish. Run it with a timeout of at least 6 minutes (or in the background and wait for it) and
  don't stop it early.
- It needs network access, opens the browser and listens on this computer (`127.0.0.1`) for
  Google's reply, so a sandboxed app (Codex) must run it outside the sandbox. The user approves.
- If no browser opens, give the user the printed link (it starts with
  `https://accounts.google.com/`) to open in a browser **on this same computer** while `login` is
  still waiting. It doesn't work on another device.
- When it works it prints JSON like `{"loggedIn": true, "email": "name@example.com", …}`. The login
  is saved in `~/.visrec-slides/token.json`, a separate file from the downloaded kit files, so
  downloading the kit again later keeps the user signed in.
- If it fails, tell the user the error's `hint` in plain words and stop. See Troubleshooting below.

Then run `node ~/.visrec-slides/vsk.mjs whoami` (it prints JSON with `email`) and tell the user:
"You're signed in as name@example.com." Ask if that is the account the deck is shared with. If not:
`vsk logout`, then `vsk login` again with the right account.

## Step 6: Remember the kit for later chats

Save a short note in your own app's global memory, so you use the kit in future chats. Do only the
part for the app you are. Never overwrite existing content: if the file already exists, show the
user what you will add and ask first.

### Claude Code / Claude desktop app (Code tab)

Create the skill `~/.claude/skills/visrec-slides/SKILL.md`: frontmatter, one line saying where the
kit is, then the full text of `KIT_GUIDE.md`, then one line with the starter prompts link. If
`SKILL.md` already exists (an earlier setup), ask the user before replacing it.

macOS / Linux / Git Bash:
```bash
mkdir -p ~/.claude/skills/visrec-slides && {
  printf '%s\n' '---' 'name: visrec-slides' \
    'description: "Read and edit Google Slides decks with the Visrec Slides Kit (vsk). Use when the user wants to see, change, check or add to a Google Slides deck, such as a Visrec deck or a docs.google.com/presentation link (storyboards, Gantt charts, tidy layouts, pictures, footers, speaker notes)."' \
    '---' '' \
    'The kit is installed in `~/.visrec-slides`: run it as `node ~/.visrec-slides/vsk.mjs <command>`. Where the guide below says `<kit folder>` or `vsk.mjs`, use that path. (`help` prints plain text; every other command prints JSON.)' ''
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
  '---', '',
  'The kit is installed in `%USERPROFILE%\.visrec-slides`: run it in PowerShell as `node "$env:USERPROFILE\.visrec-slides\vsk.mjs" <command>`. Where the guide below says `<kit folder>` or `vsk.mjs`, use that path. (`help` prints plain text; every other command prints JSON.)',
  '') -join "`n"
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
Visrec Slides Kit: `node ~/.visrec-slides/vsk.mjs <command>` (output is JSON; `help` is plain
text). Before the first kit command in a session, read `~/.visrec-slides/KIT_GUIDE.md` and follow
it. Starter requests and how to handle each: https://nokkanato.github.io/visrec-slides-setup/prompts.md
```

On Windows, write the paths in that section as `"$env:USERPROFILE\.visrec-slides\vsk.mjs"` and
`$env:USERPROFILE\.visrec-slides\KIT_GUIDE.md`.

### Antigravity

Append the same section to `~/.gemini/GEMINI.md` (Windows: `%USERPROFILE%\.gemini\GEMINI.md`), with
the same rules as for Codex.

### Another app that can run commands

Append the same section to that app's global instructions file. If you aren't sure which file that
is, ask the user.

## Step 7: Quick test

Ask the user for a deck link (`https://docs.google.com/presentation/d/…`). Run:
```bash
node ~/.visrec-slides/vsk.mjs outline --deck "<deck link>"
```
Show a short summary: the deck's title, how many slides, and a few slide titles. Then tell the user
the setup is done: who they are signed in as, that a new chat picks up the kit (Step 6), and three
example requests from the starter prompts.

If `outline` fails with a permission or "not found" error, the deck isn't shared with the signed-in
account. Tell the user to ask the deck owner to share it with the email from `whoami` as
**Editor**. With Viewer or Commenter access, `outline` works but edits fail; they also need Editor.

## Step 8: Update or remove (when the user asks)

**Update** ("update my Visrec Slides Kit"): compare `vsk version` with
`curl -fsSL https://nokkanato.github.io/visrec-slides-setup/kit/VERSION`. Then run the Step 3
downloads again. They replace `vsk.mjs` and `KIT_GUIDE.md` only; the login file (`client.json`)
and the saved login (`token.json`) stay, so no new sign-in is needed. Claude: rebuild the skill
from Step 6 (it holds a copy of `KIT_GUIDE.md`, so replacing it is expected here; tell the user).
Codex and Antigravity: nothing to change, their section points at the file. Run `vsk version` and
`vsk whoami` to check.

**Remove** ("remove the Visrec Slides Kit"): tell the user what you will delete, ask OK, then:
1. `node ~/.visrec-slides/vsk.mjs logout` (cancels the login at Google and deletes `token.json`).
2. Delete the folder, which also removes the login file:
   `rm -rf ~/.visrec-slides`
   (PowerShell: `Remove-Item -Recurse -Force "$env:USERPROFILE\.visrec-slides"`).
3. Claude: delete the folder `~/.claude/skills/visrec-slides/`. Codex / Antigravity: remove only the
   "Visrec Slides Kit" section from `AGENTS.md` / `GEMINI.md` and keep everything else.
4. Tell the user they can also check their Google account at https://myaccount.google.com/connections
   (Security → third-party apps) and remove the kit's access there.

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

Kit details worth knowing:
- Output is JSON on stdout. Errors are JSON `{"error": …, "hint": …}` on stderr with exit code 1
  (Google or runtime problem) or 2 (wrong usage). `check` exits 1 when it finds problems; that is
  its answer, not a failure. `help` prints plain text.
- `--index` is **0-based** and is the slide's **final position** (`dup`, `move-slide`): slide
  number 1 = index 0. `dup` without `--index` puts the copy right after the original.
- `--deck` takes the full browser link. A link ending in `#slide=id.XYZ` also picks the slide for
  `read`, `thumb` and `notes`, so `--slide` can be left out there.
- Multi-line text: put real newlines in the argument, or write the text to a file and pass
  `text --text-file f.txt` / `notes --set-file f.txt`. Long JSON: `--replace @file.json`,
  `--requests @file.json`.
- `text` replaces **all** the text in one box, and the new text gets a single style (what the box
  had left), so formatting inside the box (a bold word, a second colour or size) is lost.
  `replace` keeps the formatting of the text it replaces: use it when only some words change.
- `check --deck D` finds elements off or partly off the slide and empty slides;
  `check --expect '["text", …]'` also reports any of those texts that are missing from the deck.
  It can't see text overflowing its box: look at the thumbnails for that.
- `image --file` takes PNG, JPEG or GIF (up to 50 MB, 25 megapixels). The kit briefly uploads it to
  the user's Google Drive as "vsk temp import (safe to delete)" and moves that file to the trash
  straight after. If a warning says the temp file was left, tell the user they can trash it.
- `version` prints the kit version as JSON.

---

## Troubleshooting

| What you see | What it means | What to tell the user |
|---|---|---|
| `node: command not found` / `'node' is not recognized` | Node.js is missing, or was just installed and this session can't see it yet | Step 2. After installing, quit and reopen the app, then paste the starter line again. |
| A download fails (404, could not resolve host, blocked) | no network permission, or the kit files aren't reachable | Approve network access when the app asks. If it still fails, send the error to Nok. |
| "No Google sign-in client is set up yet (client.json not found)" | the login file isn't in `~/.visrec-slides/` | Step 4. If they don't have the file, ask Nok for "the Visrec Slides login file". |
| "The Google sign-in client file is not valid JSON" / "… is not a Desktop app client" | a different file was copied as `client.json` | Copy the right file again (Step 4), or ask Nok to send the Visrec Slides login file again. |
| "Google hasn't verified this app" | expected for this company tool | Click **Advanced** → **Go to … (unsafe)** → tick every box → **Continue**. |
| "Access blocked: … has not completed the Google verification process" | the kit's Google sign-in is still limited to test users | Tell Nok, with the Google account the user signed in with. |
| "Access blocked", "This app is blocked", `admin_policy_enforced` | the user's company Google admin blocks outside apps for that account | Use another Google account (for example a personal Gmail) and ask the deck owner to share the deck with that one, or ask the company's IT admin. |
| "Google sign-in was cancelled (access_denied)", or the browser was closed | the user clicked Cancel or closed the window | Run `vsk login` again. |
| "Sign-in timed out" | nobody finished the browser sign-in within 5 minutes | Run `vsk login` again and finish in the browser on this computer. |
| "Google did not give all the permissions vsk needs" | a box was left unticked | Run `vsk login` again and tick every box (or Select all). |
| "The Google Slides/Drive API is not switched on" | a setting in the kit's Google Cloud project | Tell Nok. |
| Permission denied / "not found" for a deck | the deck isn't shared with the signed-in account, or only as Viewer/Commenter | Check `vsk whoami`. Ask the deck owner to share the deck with that email as **Editor**. |
| Wrong Google account | signed in with a different account | `vsk logout`, then `vsk login` with the right one. |
| "Your Google login expired or was removed" / `invalid_grant` | the saved login no longer works (for example the user removed access in their Google account) | Run `vsk login` again. |
| An element or slide id is suddenly "not found" | someone else changed or deleted it a moment ago | Run `outline` / `read` again and continue with the new ids. |
| "Google could not fetch that link" (`image --url`) | the link opens a web page, is private, or blocks downloads | Use the link of the picture itself, or download it and use `image --file`. |
| "WebP" / "HEIC" / "SVG" / picture too big | the picture type isn't supported, or it is too large | Convert to PNG or JPEG (macOS: `sips -s format png in.heic --out out.png`) or make it smaller. |
