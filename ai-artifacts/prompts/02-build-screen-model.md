# Build Screen Model

Use:

* ai-artifacts/01-product.model.json
* UI kit package or local UI kit sources, if present

Product Model is approved.

Do not re-analyze requirements or rebuild Product Model. Read requirement files only to detect and resolve `NEEDS_INPUT`; otherwise treat Product Model as the source of truth.

---

## Handling `NEEDS_INPUT`

Before starting the stage, recursively read every file under `requirements/` and find all occurrences of `NEEDS_INPUT`.

For each unresolved item, determine whether it affects the result of the current stage. Do not make a business decision on behalf of the Product Manager or replace a missing answer with a professional assumption.

If at least one unresolved item affects the current stage:

1. create or update `ai-artifacts/needs-input.md`;
2. record the source file and the heading of the unresolved item;
3. formulate a specific question for the Product Manager or client;
4. explain which part of the current stage depends on the answer;
5. stop generating artifacts for the current stage and return the status `NEEDS_INPUT`;
6. ask the questions in the conversation.

After an answer is received:

1. update the original requirement file that contained the relevant `NEEDS_INPUT` block;
2. replace the unresolved text with the confirmed decision;
3. preserve all context related to that decision;
4. mark the item as resolved in `ai-artifacts/needs-input.md`;
5. show the Product Manager which files were changed;
6. continue the stage only after the Product Manager confirms the changes.

List unresolved items that do not affect the current stage as open questions in the report. Do not close them or decide them independently.

## Output Language

All human-readable output must be written in Russian.

This applies to:

* `ai-artifacts/05-screen-model-report.md`;
* all Markdown headings;
* report tables;
* descriptions;
* navigation issues;
* UX risks;
* component reuse notes;
* missing component descriptions.

Do not write English prose in human-readable artifacts.
Keep only file names, JSON keys, status values, technical identifiers, component names, quoted source text, and code-like values in their original form.
Use Russian section titles in Markdown artifacts.
If an English section name is needed as a stable technical marker, write it only in parentheses after the Russian title.

---

Goal

Build Screen Model.

Create:

ai-artifacts/02-screen.model.json

---

For every screen from Product Model determine:

* purpose
* primary entity
* user goals
* actions
* states
* navigation
* required data
* candidate UI kit components

---

For each screen create structure:

{
"screenId": "",
"screenName": "",
"purpose": "",
"entity": "",
"userGoals": [],
"actions": [],
"states": [],
"navigation": [],
"dataRequirements": [],
"candidateComponents": []
}

---

Additional task

Analyze UI kit.

Identify reusable components.

Map screens to existing components.

Do not generate Visual Prototype HTML at this stage.

Do not generate React code or backend code.

Output only Screen Model.

---

Create report:

ai-artifacts/05-screen-model-report.md

Include:

* number of screens;
* component reuse opportunities;
* missing components;
* navigation issues;
* UX risks.

