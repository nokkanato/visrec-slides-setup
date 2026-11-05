# Visrec Slides: starter prompts and how to handle them

For AI agents that use the **Visrec Slides Kit**. Setup: https://nokkanato.github.io/visrec-slides-setup/agent-setup.md

These are 30 things staff often ask, in Thai and English, each with a short playbook in kit
commands. Users say them in their own words; match the meaning, not the exact text.

- `vsk` means `node ~/.visrec-slides/vsk.mjs` (Windows PowerShell:
  `node "$env:USERPROFILE\.visrec-slides\vsk.mjs"`). Every command prints JSON except `help`
  (plain text). Errors are JSON `{"error", "hint"}` on stderr: show the user the `hint`.
- `--deck` takes the deck's id or its full link. A link ending in `#slide=id.XYZ` also picks the
  slide for `read`, `thumb` and `notes`. Use slide and element ids from `outline` / `read`, not
  slide numbers: numbers move when anyone adds or deletes a slide.
- `--index` (`dup`, `move-slide`) is 0-based and is the slide's final position: slide number 1 =
  index 0. `dup` without `--index` puts the copy right after the original.
- `place` and `image` take positions and sizes in points (pt). A standard 16:9 slide is
  720 × 405 pt; `outline` prints the deck's real `pageSize`.
- `read` gives each element's id, kind, text and box (x, y, w, h in pt). It does **not** show
  fonts, font sizes or colours: for those, look at a `thumb` or ask the user.
- `text --element E` replaces all the text in one box, and the new text gets one style, so
  formatting inside the box (a bold word, a second colour or size) is lost. `replace` keeps the
  formatting of the text it replaces: use it when only some words change.
- Multi-line text: real newlines in the argument, or `text --text-file f.txt` /
  `notes --set-file f.txt`.
- `batch --requests` takes a JSON array of Google Slides API requests (`createTable`,
  `insertText`, `updateTextStyle`, `createShape`, …). In those, give sizes as
  `{"magnitude": 120, "unit": "PT"}` and colours as 0–1 numbers (`#E63946` = red 0.902, green
  0.224, blue 0.275). Long JSON: save it to a file and pass `--requests @file.json` (the same
  works for `dup --replace @file.json`).

## Rules for every request

1. **Vague request** ("do a storyboard"): ask ONE short question first (which content or slides,
   and what input: brief, script, dates). Don't guess the content.
2. **Copy the deck's own look**: make new slides with `dup` from an existing slide of the same kind,
   then change the text. Never invent a new style.
3. **One slide first**: do one, `thumb` it, look at the picture, show the user, then do the rest.
4. **Thai text runs longer and taller**: `thumb` every changed slide; fix text that doesn't fit,
   overlaps or runs off the slide.
5. **Other people work in the same deck at the same time**, and the kit can change any slide the
   user can. Change only the slides the user asked about. Before anything that touches other
   slides (`replace` without `--slide`, `move-slide`, `del`), list what will change and ask "OK?".
6. Reply in the user's language.

---

## The 30 prompts

### 1. Storyboard
"ทำ storyboard ให้หน่อย" / "Do a storyboard for me"
- Ask which content, how many shots, and for the script or brief.
- `outline` → find an existing storyboard slide like it (same number of shots if possible) →
  `dup --from <slideId>` (the copy lands right after it; add `--index N` for another place).
- `read` the copy → change the title, description and shot texts with `text --element` or
  `replace --slide <newId>`.
- Picture boxes: keep the old pictures as placeholders, or put new ones in (see 4 and 5).
- `thumb` the first slide, show the user, then do the rest.

### 2. Gantt chart
"ทำ Gantt chart" / "Make a Gantt chart of the shooting schedule"
- `read` the schedule slides (tasks and dates). Ask which weeks to show if it isn't clear.
- New slide: `dup` a plain title slide, change the title, remove the old body box if there is
  one (`batch` `deleteObject`, after checking).
- `batch`: `createTable` (rows = tasks + 1 header row, columns = weeks + 1), `insertText` with
  `cellLocation` for labels, `updateTableCellProperties` to colour the busy cells. Or draw bars
  with `createShape`. Keep it inside the slide.
  ```json
  [{"createTable": {"objectId": "gantt1", "elementProperties": {"pageObjectId": "<slideId>"}, "rows": 6, "columns": 9}},
   {"insertText": {"objectId": "gantt1", "cellLocation": {"rowIndex": 0, "columnIndex": 1}, "text": "W1"}},
   {"updateTableCellProperties": {"objectId": "gantt1",
     "tableRange": {"location": {"rowIndex": 1, "columnIndex": 2}, "rowSpan": 1, "columnSpan": 3},
     "tableCellProperties": {"tableCellBackgroundFill": {"solidFill": {"color": {"rgbColor": {"red": 0.2, "green": 0.5, "blue": 0.9}}}}},
     "fields": "tableCellBackgroundFill.solidFill.color"}}]
  ```
- `thumb`. A chart linked to Google Sheets isn't possible with the kit (see 30).

### 3. Tidy the slides
"จัดสไลด์ให้เรียบร้อย" / "Tidy my slides: line up the pictures and make the font sizes the same"
- Ask which slides. `read` each for positions and sizes. `read` doesn't show font sizes: judge
  from a `thumb`, or ask the user which size to use.
- Plan it: same left edges, same tops, equal gaps, same size for pictures of the same kind.
- `place --element <id> --x --y --w --h` for each element. Keep pictures' width-to-height
  ratio (no stretching).
- Even font sizes: `batch` `updateTextStyle` with `"style": {"fontSize": {"magnitude": 14, "unit": "PT"}}`,
  `"textRange": {"type": "ALL"}`, `"fields": "fontSize"`.
- One slide first + `thumb`, then the rest.

### 4. Put pictures in
"ใส่รูปให้หน่อย" / "Put this picture on slide 5" / "Make a picture of X and put it on slide 5"
- **A file on this computer** (the user gives the file, or says where it is, e.g. "the newest
  picture in Downloads", or saved from LINE): `image --deck D --slide <id> --file <path>`.
  A picture pasted into the chat may not exist as a file: ask the user to save it and say where.
- **A public link**: `image --url https://…`. The link must open the picture itself, not a web
  page around it.
- **Into a placeholder box**: `read` the slide → take the placeholder's x, y, w, h → `image`
  with that box → ask whether to remove the placeholder (`batch` `deleteObject`).
- **A picture you make**: if your app can make pictures, save it as PNG and use `--file`. If it
  can't, say so and offer to find one (see 5) or draw a simple one with shapes (see 27).
- PNG, JPEG or GIF. Convert WebP/HEIC first (macOS: `sips -s format png in.heic --out out.png`).
- Only use pictures the user may use. Never put the client's private photos on public image
  sites to get a link: use `--file` instead.
- `thumb` after each picture.

### 5. Find a picture on the web
"หารูปร้านกาแฟสวยๆ มาใส่สไลด์ 5 หน่อย" / "Find a nice picture of a coffee shop for slide 5"
- Only when the user asks you to find one. Search the web if your app can.
- Prefer pictures that are free to use (stock sites with a free licence) or from the client's
  own site. Show the user 2–3 options with their source pages and ask which one.
- Put it in with `image --url <direct picture link>`, or download it to a temporary folder
  (`curl -fsSL -o <tmp>/pic.jpg <link>`) and use `image --file`.
- Tell the user where the picture came from. `thumb`.

### 6. Update the footer
"อัปเดต footer" / "Change the footer date to today"
- `read` one slide. If the footer is a normal text box on the slide, it shows up in `read`:
  `replace --find "<old footer text>" --with "<new>"`. Without `--slide` that changes every slide,
  including other people's, so list the slides and ask OK first.
- If `thumb` shows the footer but `read` doesn't, it sits on the layout or theme. The kit can't
  change it. Tell the user: Google Slides → Slide → Edit theme, change it once and every slide
  updates. It changes everyone's slides, so check with the deck owner first.

### 7. Who edited this slide
"ใครแก้สไลด์นี้" / "Who changed slide 12 today?"
- The kit can't read the edit history. Tell the user: open the deck in Google Slides →
  File → Version history → See version history (Ctrl+Alt+Shift+H, Mac ⌘+Option+Shift+H). Each
  version shows who changed it; changes made through the kit show under that person's own name.
- Restoring an old version also undoes everyone else's later work: talk to the team first.

### 8. Rename something in the whole deck
"เปลี่ยนชื่อเมนู X เป็น Y ทั้ง deck" / "Rename X to Y everywhere"
- Find every place first (`outline`, then `read` the slides that may contain it). Watch for
  matches inside longer words.
- Show the list (slide and old → new) and ask: the whole deck, or only the user's slides?
- Whole deck: `replace --find X --with Y`. Only some slides: `replace --slide <id>` for each.
- `thumb` a few changed slides.

### 9. Change a price
"แก้ราคา 189 เป็น 199" / "Change the price 189 to 199"
- List every place first and watch the forms: "189.-", "189 บาท", "฿189", and "1,189", which
  must NOT change. Ask OK.
- Replace the exact text you found (e.g. `--find "189.-"`), slide by slide with `--slide`.

### 10. Translate
"แปล storyboard เป็นอังกฤษ" / "Translate the storyboard to English"
- Ask: replace the Thai, or keep both?
- `read` → translate each box → `replace --slide` (keeps the formatting) or
  `text --element <id> --text "…"` (one style for the whole box: fine for plain boxes).
- `thumb` every slide: English fits differently from Thai.

### 11. Client feedback to a checklist
"สรุป feedback ลูกค้าเป็น checklist" / "Turn today's client feedback into a checklist"
- `outline` → `read` the feedback slides. Group the points by content or slide.
- Give the checklist in chat. Put it on a new slide only if asked (`dup` a text slide, `text`).

### 12. Fix typos
"ตรวจคำผิดทั้งหมด" / "Check for typos"
- Ask which slides (the user's, or the whole deck). `read` them.
- List each typo: slide, old → new. Apply only after OK, with `replace --slide <id>`.

### 13. Shorten text to fit
"ย่อข้อความให้พอดีกล่อง" / "Shorten this so it fits the box"
- `read` → rewrite shorter, keep the meaning (ask if unsure what may go) →
  `text --element <id> --text "…"` → `thumb`.
- `text` gives the whole box one style. If the box mixes formatting (a bold word, two colours),
  use `replace --find "<old sentence>" --with "<shorter one>" --slide <id>` instead: it keeps the
  formatting.

### 14. Speaker notes
"เขียน speaker notes สำหรับพรีเซนต์" / "Write speaker notes for my slides"
- `notes --slide <id>` shows existing notes. Ask before replacing notes that aren't empty.
- Write notes from the slide content (`read`), then `notes --slide <id> --set "…"`.

### 15. New slide after a section
"ใส่ feedback วันนี้เป็นสไลด์ใหม่ต่อจาก Content 3" / "Add today's feedback as a new slide after Content 3"
- `outline` → find the last slide of Content 3 and an existing feedback slide.
- `dup --from <feedback slide> --index <N>`, where N = the `index` of Content 3's last slide + 1
  → change the text → `thumb`.

### 16. Move a schedule
"เลื่อนตารางทั้งหมด 3 วัน" / "Move every date in my schedule 3 days later"
- `read` the date tables. Recompute every date **with the right weekday**. Ask about weekends and
  holidays.
- Show old → new and ask OK.
- Apply cell by cell (`batch` `deleteText` + `insertText` with `cellLocation`), or with
  `replace --slide`. With `replace`, don't chain: moving "3 Nov" → "6 Nov" and then "6 Nov" →
  "9 Nov" moves the first one twice. Go from the latest date to the earliest.

### 17. Update a calendar
"อัปเดต calendar เดือนพฤศจิกายน" / "Update the November calendar"
- `read` the calendar table. Change cells with `batch` (`deleteText` with
  `"textRange": {"type": "ALL"}` then `insertText`, both with `cellLocation`; leave out
  `deleteText` for an empty cell, it fails there), or `replace --slide` when the text is unique.
- `thumb`.

### 18. Check before sending
"เช็กทั้ง deck ก่อนส่งลูกค้า" / "Check all my slides before we send them to the client, and show me a picture of each"
- Ask which slides if the deck is big. `check --deck D` lists elements off or partly off the
  slide and empty slides; add `--expect '["Content 10", "Nov 2026"]'` to report text that should
  be in the deck but isn't. It exits with code 1 when it finds something; that is its answer.
  It can't see text that overflows its box: the pictures show that.
- `thumbs --deck D --out <folder>` and look at each picture. Judge by the picture: a big text box
  or a picture placed half off the slide is sometimes on purpose.
- Report a short list per slide. Fix only after OK.

### 19. New content from an existing one
"ทำ Content 10 โดยใช้ Content 3 เป็นแบบ" / "Make Content 10 using Content 3 as the template"
- Ask for Content 10's material (brief, script, shots).
- `outline` → the Content 3 slides, in order → `dup` each with `--index` so the copies stay in the
  same order where the user wants them.
- Change "Content 3" → "Content 10" and the other text, slide by slide (`replace --slide`,
  `text`). `thumb`.

### 20. Move slides
"ย้ายสไลด์ Cast ไปไว้หลัง Storyboard" / "Move the Cast slides after the Storyboard"
- `outline` → the slides to move and where. Moving changes slide numbers for everyone: ask OK.
- `move-slide --slide <id> --index <n>`, one at a time, keeping their order. `outline` to check.

### 21. Delete unused slides
"ลบสไลด์ที่ไม่ใช้" / "Delete the slides we don't use"
- List the candidates (empty, duplicates, marked "old") and ask which. Never guess.
- `del --slide <id> --yes`, one by one, only the ones the user confirmed.

### 22. New cover
"ทำหน้าปกใหม่" / "Make a new cover"
- Ask: replace the old cover, or add a new one? `dup` the cover → change the title and date →
  `thumb`. Delete the old one only if the user said so.

### 23. Section divider
"ทำหน้าคั่น section" / "Add a section divider for Props"
- `dup` an existing divider (e.g. "Storyboards") → `--index` where the section starts →
  change the word → `thumb`.

### 24. Brand colours
"เปลี่ยนสีหัวข้อเป็นสีแบรนด์" / "Make the headings the brand colour"
- Find the colours: `read` doesn't show colours, so `thumb` the brand colour slide and read the
  codes from the picture if they are written there, or ask the user for the colour codes.
- On the slides the user names: `batch` `updateTextStyle` on the heading boxes with
  `"style": {"foregroundColor": {"opaqueColor": {"rgbColor": {...}}}}`, `"fields": "foregroundColor"`.
- `thumb`.

### 25. Line up shot pictures
"จัดรูป 6 ช็อตให้เท่ากัน เรียงสวยๆ" / "Make the 6 shot pictures the same size and line them up"
- `read` → the pictures and their captions. Work out a grid in pt (e.g. 3 × 2, equal margins and
  gaps).
- `place` each picture and its caption. Keep each picture's width-to-height ratio. `thumb`.

### 26. Table (e.g. prop list)
"ทำตาราง prop list" / "Make a prop list table"
- If the deck already has a table slide, `dup` it and fill it in: that keeps the deck's look.
- Otherwise `batch` `createTable` + `insertText` per cell (`cellLocation`), header row bold
  (`updateTextStyle` `bold`). `thumb`: long lists may need two slides.

### 27. Arrows, frames, icons
"ใส่ลูกศร / กรอบ / ไอคอน" / "Add an arrow from shot 1 to shot 2"
- `batch` `createShape` (`RIGHT_ARROW`, `RECTANGLE`, `ROUND_RECTANGLE`, `ELLIPSE`, …) or
  `createLine`. A frame = a rectangle with no fill (`updateShapeProperties`).
- Icons are pictures: `image --file` or `--url` (PNG with a transparent background works best).
- `thumb`.

### 28. Theme or fonts for the whole deck
"เปลี่ยนธีม / ฟอนต์ทั้ง deck" / "Change the theme / font of the whole deck"
- Theme and layouts: done by hand in Google Slides (Slide → Change theme / Edit theme). It changes
  every slide for everyone, so the deck owner decides.
- Fonts on some slides: `batch` `updateTextStyle` with `fontFamily`, only on the slides the user
  names. `thumb`: a new font can change line breaks.

### 29. Reference video
"ใส่วิดีโอ reference" / "Add this YouTube video as a reference"
- YouTube: `batch` `createVideo` with `"source": "YOUTUBE"` and the video id (the part after
  `v=` or `youtu.be/`). `thumb`.
- Google Drive video: tell the user to add it by hand (Insert → Video → Google Drive).

### 30. Chart from Google Sheets
"ใส่กราฟจาก Google Sheets" / "Put the chart from our Google Sheet here"
- The kit can't add a chart linked to Google Sheets. Offer one of these:
  - a table or simple bars made with shapes (see 2);
  - the user adds it by hand: Insert → Chart → From Sheets (it stays linked to the sheet);
  - a picture of the chart: the user downloads it as PNG and you put it in with `image --file`.
