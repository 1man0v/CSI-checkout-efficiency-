# Build Visual Prototype

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

## Inputs

* approved requirements;
* `ai-artifacts/01-product.model.json`;
* `ai-artifacts/02-screen.model.json`;
* optional Figma file or link, UI kit, design system, components, layouts and visual references supplied by the user.

## Output language

All human-readable output must be written in Russian.

## Goal

Create a clickable Visual Prototype that represents the approved Screen Model in a browser without a real backend, database or production integrations.

Create:

```text
visual-prototype/
ai-artifacts/03-visual-prototype.model.json
ai-artifacts/06-visual-prototype-report.md
```

## Figma option

Use Figma only when the user explicitly requests it or provides a Figma source.

The user may ask you to:

* read an existing Figma file as a source of components, styles, layouts and design-system rules;
* generate new layouts and components in Figma for the Visual Prototype;
* prepare the result so the Product Manager or designer can adjust it manually in Figma.

Do not make Figma mandatory. Git remains the canonical storage for Product Compiler artifacts. If Figma is used, record the file reference, what was read or generated, and how the Git artifact corresponds to the Figma result.

## Requirements

The Visual Prototype must:

* provide clickable navigation through the key scenarios;
* implement menus, tabs, forms, filters, dialogs, drawers and relevant local interactions;
* represent loading, empty, success, validation-error and server-error states when defined by Screen Model;
* use embedded test data or mocks;
* not require a real API, backend or database;
* preserve traceability to Product Model and Screen Model;
* document the use of Figma and component sources when applicable.

If Screen Model is incomplete or inconsistent, do not silently repair it in the Visual Prototype. Record the issue in the report, identify the exact screens or transitions that must be corrected, and return:

```text
BLOCKED_FOR_VISUAL_PROTOTYPE
```

Otherwise return:

```text
APPROVED_VISUAL_PROTOTYPE
```

## Report

The report must include:

* covered scenarios and screens;
* navigation and interactions implemented;
* represented states;
* test-data approach;
* Figma usage, source components and generated layouts/components, if applicable;
* deviations from Screen Model;
* blockers and next actions;
* final status.
