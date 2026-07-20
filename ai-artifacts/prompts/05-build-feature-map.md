# Build Feature Map

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
* `ai-artifacts/07-prototype-report.md`.

## Goal

Create a product-level feature map for subsequent implementation through Feature SDD.

Create:

```text
ai-artifacts/08-feature-map.md
```

## Requirements

* split the product into small vertical features with independent user value;
* define for each feature its goal, users, boundaries, dependencies and product-level acceptance criteria;
* preserve traceability to requirements, Product Model, Screen Model, Visual Prototype and Prototype scenarios;
* distinguish required product behavior from prototype-only shortcuts;
* list unresolved product blockers and open questions;
* do not create production architecture, implementation tasks or production code.

If product blockers remain, final status must be:

```text
NEEDS_INPUT
```

Otherwise final status must be:

```text
READY_FOR_FEATURE_MAP_REVIEW
```

Use Russian for all human-readable output.
