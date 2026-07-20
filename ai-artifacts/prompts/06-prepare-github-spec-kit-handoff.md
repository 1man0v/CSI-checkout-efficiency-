# Prepare GitHub Spec Kit Handoff

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

Inputs:

* approved requirements;
* `ai-artifacts/01-product.model.json`;
* `ai-artifacts/02-screen.model.json`;
* `ai-artifacts/03-visual-prototype.model.json`;
* `visual-prototype/`;
* `prototype/`;
* `ai-artifacts/07-prototype-report.md`;
* `ai-artifacts/08-feature-map.md`.

## Goal

Finish Product Compiler and prepare a consistent engineering handoff package for GitHub Spec Kit and Feature SDD.

Create:

```text
ai-artifacts/09-github-spec-kit-handoff.md
```

## Requirements

* verify that all required Product Compiler artifacts exist and are mutually consistent;
* provide an artifact index and traceable links;
* use the approved Feature Map as the entry point for Feature SDD;
* distinguish required product behavior from prototype-only shortcuts;
* list known risks, dependencies and decisions that must be made by engineers;
* confirm that no unresolved product blockers remain;
* do not create production architecture, implementation tasks or production code in Product Compiler.

## Final status

If any required artifact is missing, inconsistent, or contains an unresolved product blocker, use:

```text
NEEDS_INPUT
```

Otherwise use:

```text
READY_FOR_GITHUB_SPEC_KIT
```

Use Russian for all human-readable output.
