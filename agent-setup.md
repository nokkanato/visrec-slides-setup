# Visrec Slides: setup instructions for AI agents

You are an AI agent. Your user asked you to set them up for **Visrec Slides**. This is a
remote MCP server that lets several people edit one shared Google Slides deck at the same time.
Each person edits only their own chunk of slides through their own AI agent. Follow these steps
in order. Keep the user informed in plain words, **in the language they write to you in** (Thai or
English).

- MCP server URL: `https://visrec-slides-mcp-724601136304.asia-southeast1.run.app/mcp`
- Server name to use in configs: `visrec-slides`
- Login: OAuth, "Sign in with Google" in the user's browser. Never ask the user to paste a
  password, token or login code into the chat.
- Bot account that decks must be shared with: `visrec-slides-bot@visual-record.iam.gserviceaccount.com`

Before you change a config file, tell the user what you are about to add. Add only the
`visrec-slides` entry. Don't remove or change anything else. If the file exists, make a backup copy
next to it first.

---

## Step 1: Work out which client you are running in

Pick exactly one:

| You are… | How to tell | Go to |
|---|---|---|
| **Claude Code** (terminal / IDE) | you can run shell commands and `claude --version` works | 2A |
| **Claude** web, desktop app or mobile app (chat) | you cannot run shell commands | 2B |
| **Codex CLI** (OpenAI) | `codex --version` works / you are Codex | 2C |
| **Gemini CLI** | `gemini --version` works / you are Gemini CLI | 2D |
| **Antigravity CLI or IDE** (Google) | `agy --version` works / you are Antigravity | 2E |

If you can't tell, ask the user which app they are using.

Note for Google users: Gemini CLI was replaced by Antigravity CLI for free-tier and Google One
accounts on 2026-06-18 (per geminicli.com). Paid / Workspace Gemini CLI users can still use 2D.

---

## Step 2A: Claude Code

<!-- Claude Code `claude mcp add --transport http` syntax: Anthropic Claude Code docs
     (code.claude.com/docs/en/mcp), checked 2026-11-04. -->

1. Run:
   ```bash
   claude mcp add --transport http visrec-slides --scope user https://visrec-slides-mcp-724601136304.asia-southeast1.run.app/mcp
   ```
2. You can't do the login yourself. Tell the user: *"Type `/mcp`, choose **visrec-slides**,
   follow the login prompt. A browser opens. Sign in with Google using the email Nok added for
   you."*
3. After they confirm, go to Step 3. If the tools don't show up yet, ask the user to restart
   Claude Code (or start a new session) and continue from Step 3.

## Step 2B: Claude web / desktop / mobile

You can't change these settings yourself. Walk the user through it, one step at a time:

1. Open **Settings → Connectors** (on claude.ai or in the Claude desktop app). On mobile, set it
   up once on the web or desktop app first; it then works on mobile too.
2. Click **Add custom connector**.
   - Name: `Visrec Slides`
   - URL: `https://visrec-slides-mcp-724601136304.asia-southeast1.run.app/mcp`
   - Leave the advanced / OAuth Client ID fields **empty**.
3. Click **Add**, then **Connect**. A Google sign-in opens. Sign in with the email Nok added.
4. In a chat, make sure the **Visrec Slides** connector is turned on (the tools / "+" menu in the
   message box).
5. If there is no "Add custom connector" button: on Claude Team/Enterprise plans only an
   organization owner can add custom connectors. Ask the user to ask their Claude admin.

Then go to Step 3 (in a new chat if the tools don't appear).

## Step 2C: Codex CLI

<!-- Source: OpenAI Codex docs, https://learn.chatgpt.com/docs/extend/mcp?surface=cli
     (redirected from developers.openai.com/codex/mcp), checked 2026-11-04.
     Not yet tested against this server: to verify in Phase 2. -->

1. Add the server, either with the CLI:
   ```bash
   codex mcp add visrec-slides --url https://visrec-slides-mcp-724601136304.asia-southeast1.run.app/mcp
   ```
   or by adding this to `~/.codex/config.toml`:
   ```toml
   [mcp_servers.visrec-slides]
   url = "https://visrec-slides-mcp-724601136304.asia-southeast1.run.app/mcp"
   ```
2. Log in:
   ```bash
   codex mcp login visrec-slides
   ```
   A browser opens. The user signs in with Google using the email Nok added. In the Codex
   desktop app, use **Authenticate** next to the server instead.
3. Ask the user to restart Codex, then go to Step 3.

## Step 2D: Gemini CLI

<!-- Source: https://geminicli.com/docs/tools/mcp-server/ , checked 2026-11-04.
     Not yet tested against this server: to verify in Phase 2. -->

1. Add the server for this user (all projects):
   ```bash
   gemini mcp add --transport http --scope user visrec-slides https://visrec-slides-mcp-724601136304.asia-southeast1.run.app/mcp
   ```
   or add this to `~/.gemini/settings.json` under `mcpServers` (note **`httpUrl`**: `url` would mean
   the older SSE transport):
   ```json
   {
     "mcpServers": {
       "visrec-slides": {
         "httpUrl": "https://visrec-slides-mcp-724601136304.asia-southeast1.run.app/mcp"
       }
     }
   }
   ```
2. Ask the user to restart Gemini CLI. Login is discovered automatically: on first use a browser
   opens for Google sign-in. If not, the user types `/mcp auth visrec-slides`.
3. Go to Step 3.

## Step 2E: Antigravity CLI or IDE

<!-- Source: https://antigravity.google/docs/mcp , checked 2026-11-04.
     Not yet tested against this server: to verify in Phase 2. -->

1. Add this entry to `~/.gemini/config/mcp_config.json` (create the file if missing; keep other
   entries):
   ```json
   {
     "mcpServers": {
       "visrec-slides": {
         "serverUrl": "https://visrec-slides-mcp-724601136304.asia-southeast1.run.app/mcp"
       }
     }
   }
   ```
2. Tell the user: *"Type `/mcp` to open the MCP manager and reload. Then open Agent settings
   (Cmd/Ctrl + ,) → Customizations → **Authenticate** next to visrec-slides. Sign in with Google,
   then paste the code the browser shows back into that panel and click Submit."*
3. Go to Step 3.

---

## Step 3: Check that it works

Call these tools. Your client may show them with a prefix, e.g. `mcp__visrec-slides__whoami`.

1. **`whoami`**. You should get the user's email. Confirm with the user that it's the right Google
   account.
2. **`list_my_decks`**. Shows the decks they're in. An empty list is normal until Nok assigns
   them slides.

Tell the user the setup is done. Give them a short summary: who they're signed in as, and which
decks and slides they have.

---

## Step 4: How to work on the user's slides (keep following these rules)

1. Call **`my_chunk(deck)`** first. It lists the slides you may edit (number, objectId, preview).
   `deck` is the Google Slides URL or ID.
2. Call **`read_slide(deck, slide)`** before you change a slide. It gives element objectIds,
   text and positions.
3. Make the change:
   - `replace_text`: change wording and keep the formatting.
   - `duplicate_slide`: make a new slide by copying any slide as a template. The copy joins the
     user's chunk.
   - `delete_slide`: only for the user's own slides.
   - `batch_update`: raw Google Slides API requests for anything else.
4. Call **`thumbnail(deck, slide)`** after each change and look at it. Fix text that doesn't fit,
   overlaps, or runs off the slide.
5. When you're done, call **`check_my_chunk(deck)`**. Then look at a thumbnail of every changed
   slide before you tell the user it's finished.

Rules:
- Edit **only the user's own chunk**. Reading other slides for context is fine.
- If the server refuses an edit, **don't try to get around it** (no splitting, renaming ids,
  retrying another way, or using other tools or accounts to edit the deck). Tell the user what
  was refused and suggest asking a deck admin (Nok) to assign that slide.
- Slide **numbers** change when anyone adds or deletes slides. Use objectIds in follow-up calls,
  and call `my_chunk` again when you're unsure.
- If you get "deck busy", wait a few seconds and retry once.
- Reply to the user in their language (Thai or English).

---

## Troubleshooting

| What you see | What it means | What to tell the user |
|---|---|---|
| "… is not on the Visrec allowlist" | the email they signed in with isn't approved | Ask Nok to add that exact email. Or, if they used the wrong Google account, sign out and sign in with the right one. No reinstall needed. |
| "not shared with the bot" / "The bot cannot see deck" / "cannot edit it" | the deck isn't shared with the bot account | The deck owner must share it with `visrec-slides-bot@visual-record.iam.gserviceaccount.com` as **Editor**. |
| "not registered on this server yet" | nobody has set the deck up yet | A deck owner/editor (usually Nok) asks their agent to `register_deck` it. |
| "You have no chunk in this deck" / my_chunk is empty | no slides assigned yet | Wait for Nok to assign slides. Until then the deck is read-only. |
| "not in your chunk" | that slide belongs to someone else or nobody | Don't retry. Ask Nok to assign it if they need it. |
| Login loops, or the browser shows an error after Google sign-in | stale or failed login | Remove the server (Claude: delete the connector; CLIs: remove the entry) and add it again. Use the same Google account Nok approved. Make sure the browser isn't blocking pop-ups. If it still fails, send Nok a screenshot of the error page. |
| Tools don't appear after login | client hasn't reloaded | Restart the app/CLI or open a new chat. |
