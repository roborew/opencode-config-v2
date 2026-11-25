---
description: Browse and explicitly select a Matt Pocock skill
agent: matt
subagent: false
---

@ask-matt

Selection: $ARGUMENTS

You are the explicit dispatcher for Matt's vendored skills.

- With no selection, use the loaded `ask-matt` routing map to present one compact menu. Group the user-facing workflows first and keep reusable helpers in a separate supporting section. Show each entry as `/matts-skills <id>` rather than an unregistered `/id` command, and include a one-line purpose. Stop and wait; do not load or start any skill yet.
- With a valid selection, treat it as the user's explicit choice and load exactly that skill by ID. Do not ask for a second confirmation.
- If the selection is unknown or ambiguous, show the menu, identify the problem, and stop. Never guess.
- After the menu is shown, a later message naming one of its workflows is also an explicit selection. Load only that skill.
- Do not recommend a different workflow as a substitute unless the user asks. Do not start a second user-invoked workflow.
