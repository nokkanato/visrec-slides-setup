# Visrec Slides setup

Lets your own AI read and edit a shared Google Slides deck as you, with your own Google login.
Guide for people (English + ไทย): https://nokkanato.github.io/visrec-slides-setup/

**AI agents:** to set someone up, follow [`agent-setup.md`](agent-setup.md) step by step
(also at https://nokkanato.github.io/visrec-slides-setup/agent-setup.md).
The Google login file (`client.json`) is **not** in this repo. Ask the person for the
Visrec Slides login file that Nok sent them. Never ask them to paste its contents.

Needs an AI that can run commands on the person's computer (Claude desktop Code tab / Claude Code,
Codex, Antigravity). Chat-only apps can't use it.

- [`kit/`](kit/): the kit (`vsk.mjs`) and how to use it (`KIT_GUIDE.md`)
- [`prompts.md`](prompts.md): 30 starter requests
- [`privacy.html`](privacy.html): what the kit accesses
