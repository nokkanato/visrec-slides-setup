# Visrec Slides Kit — guide for the AI

You are helping a Visrec staff member edit a Google Slides deck. This kit (`vsk.mjs`) runs on
their computer and edits the deck **as them**, with their own Google login. Run it with Node 18+:

```
node <kit folder>/vsk.mjs <command> --deck "<deck link or id>" [...]
```

`<kit folder>` is the folder this file is in. Every command prints JSON. If something goes wrong
it prints `{"error": …, "hint": …}` and exits non-zero.

## First time on this computer

1. `node vsk.mjs whoami` — if it says "not logged in", run `node vsk.mjs login`.
   A browser tab opens; the user signs in with the Google account the deck is shared with
   and clicks Allow. (Google may say the app is unverified: click Advanced → Go to … to continue.)
2. They can only edit decks shared with them as **Editor**.

## Workflow (every time)

1. `outline --deck D` — see the slides: `index` (0-based), `number` (1-based, what the user sees), `id`, first text.
2. `read --deck D --slide S` — see every element on the slide: `id`, `kind`, `text`, `x y w h` (pt), speaker notes.
3. Make the change (commands below). Use ids exactly as printed.
4. `thumb --deck D --slide S` — then **open the PNG and look at it** before you say it is done.
   Fix what looks wrong (text overflowing, overlaps, picture in the wrong place).
5. Optional: `check --deck D` finds elements off the slide and empty slides.

## Rules

- Only change the slides the user asked about. Give `replace` a `--slide` unless they want the whole deck.
- **Ask the user before deleting.** `del` refuses without `--yes`; only add `--yes` after they say yes.
- Every edit is saved under the user's own name. Undo/history: Google Slides → File → Version history.
- If a command fails, tell the user the `hint`. Do not retry in a loop.
- `batch` sends raw Slides API requests. Use it only when no other command fits.

## Commands

| Need | Command |
|---|---|
| Swap text (exact, case-sensitive) | `replace --deck D --find "old" --with "new" --slide S` |
| Rewrite one text box completely | `text --deck D --element E --text "new text"` (or `--text-file f.txt`) |
| Copy a slide (and change text on the copy) | `dup --deck D --from S [--index N] [--replace '{"old":"new"}']` |
| Move a slide | `move-slide --deck D --slide S --index N` (N = final 0-based position) |
| Move / resize an element | `place --deck D --element E [--x X] [--y Y] [--w W] [--h H]` (pt; left-out values stay) |
| Add a picture from this computer | `image --deck D --slide S --file /path/pic.png [--x --y --w --h]` |
| Add a picture from a public link | `image --deck D --slide S --url https://… [--x --y --w --h]` |
| Speaker notes | `notes --deck D --slide S` (read) · `notes --deck D --slide S --set "text"` |
| Picture of every slide | `thumbs --deck D` |
| Delete a slide (after asking!) | `del --deck D --slide S --yes` |

Notes:

- Units are points: the usual slide is 720 × 405 pt. `x`/`y` is the top-left corner.
- Pictures fit **inside** the box you give, keeping their shape, centred in it. With no box the picture fits the slide.
  `--file` takes PNG, JPEG or GIF up to 50 MB. For iPhone photos (HEIC) or WebP, convert first:
  `sips -s format png in.heic --out out.png` (macOS).
- `--url` must be a public `https://` link that opens without signing in.
- Line breaks in `--text`: put real newlines in the argument (`$'line 1\nline 2'` in bash/zsh), or use `--text-file`.
- Elements inside a group: move the group (`place --element <group id>`), not the piece.
- `--deck` accepts the full link from the browser. A link ending in `#slide=id.XYZ` also tells `read`/`thumb`/`notes` which slide.
