<!-- Source: docs/epics/agentic-module-generation-stories.md -->

## Story 5: Graceful Degradation and Per-Module Outcomes

### Summary
<!-- Jira: Summary field -->

Failed modules get placeholder pages on both agentic and one-shot paths; run completes with partial results and reports per-module outcomes.

### Description
<!-- Jira: Description field -->

**User Profile:**
- **Primary User:** Developer running `liminal-docgen generate` against their codebase
- **Context:** Generating or regenerating a documentation wiki for a repository, especially mid-to-large codebases (100+ components) with mixed architectural patterns
- **Mental Model:** "I point the tool at my repo and it produces a useful wiki that reflects my actual code structure"
- **Key Constraint:** Generation must complete reliably without manual intervention. Failures on individual modules should not abort the entire run.

**Objective:** When module generation fails — whether on the agentic path or the one-shot fallback — the system writes a placeholder page, logs the failure, and continues generating remaining modules. The run result includes a per-module success/failure breakdown with generation path indicated. Run status follows defined rules: `failure` when more than half of modules fail, `partial-success` when at least one fails but half or more succeed, `success` when all succeed.

**Scope:**

*In:*
- Placeholder page generation for failed modules (both paths)
- Per-module outcome reporting (`ModuleGenerationOutcome` shape)
- Run-level result with status rules (`DocumentationRunResult`)
- Failure logging with module name, reason, and partial output
- Validation reports placeholder pages as warnings, not errors
- One-shot fallback path uses same degradation guarantees

*Out:*
- Agent implementation (Story 4 — consumed here)
- Provider implementation (Story 2 — consumed here)
- Changes to validation logic itself

**Dependencies:** Story 4 (agentic generation must exist to test degradation on both paths)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-4.4:** Module generation failures do not abort the entire run

- **TC-4.4a: Single module agent failure allows remaining modules to proceed**
  - Given: A run with 10 modules where module 3's agent fails
  - When: Agent for module 3 returns an error or times out
  - Then: Modules 4-10 still generate; run result reports module 3 as failed
- **TC-4.4b: Failed module produces a placeholder page**
  - Given: A module's agent fails after partial output
  - When: The system handles the failure
  - Then: A placeholder page is written indicating generation failed, with the module name and component list preserved
- **TC-4.4c: Run result reports per-module outcomes**
  - Given: A run where some modules succeed and some fail
  - When: Run completes
  - Then: Result includes a per-module success/failure breakdown

**AC-7.1:** Failed modules get placeholder pages regardless of generation path

- **TC-7.1a: Placeholder written on agent timeout**
  - Given: Module agent exceeds time budget
  - When: System handles the timeout
  - Then: A placeholder `.md` file exists for that module with the module name and a "generation failed" notice
- **TC-7.1b: Placeholder written on agent error**
  - Given: Module agent encounters a provider error
  - When: System handles the error
  - Then: Placeholder page written; error reason included in run result
- **TC-7.1c: Placeholder written on one-shot fallback failure**
  - Given: Provider does not support tool use and one-shot generation fails for a module
  - When: System handles the one-shot failure
  - Then: Placeholder page written; system continues to next module (does not abort the run)

**AC-7.2:** Run completes with partial results when some modules fail

- **TC-7.2a: Run succeeds with warnings when 1 of 10 modules fails**
  - Given: 10 modules planned, module 4 fails (on either path)
  - When: Run completes
  - Then: Run result status is `partial-success`; 9 module pages + 1 placeholder + overview are written
- **TC-7.2b: Run fails when more than half of modules fail**
  - Given: 10 modules planned, 6 or more fail (on either path)
  - When: Run completes
  - Then: Run result status is `failure` with reason indicating too many module failures
- **TC-7.2c: All modules succeed**
  - Given: 10 modules planned, all generate successfully
  - When: Run completes
  - Then: Run result status is `success`

**AC-7.3:** One-shot fallback for providers without tool-use support

- **TC-7.3a: One-shot path used when provider lacks tool-use capability**
  - Given: Provider is openrouter-http (no tool-use support)
  - When: Module generation begins
  - Then: Existing one-shot structured-output path is used
- **TC-7.3b: Per-module outcomes reported the same way on both paths**
  - Given: A run using one-shot fallback
  - When: Run completes
  - Then: Per-module outcomes use the same `ModuleGenerationOutcome` shape as the agentic path

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

```typescript
interface ModuleGenerationOutcome {
  moduleName: string;
  status: "success" | "failed";
  generationPath: "agentic" | "one-shot";
  fileName: string;
  durationMs: number;
  turnCount?: number;
  toolCallCount?: number;
  failureReason?: string;
  hasPlaceholderPage?: boolean;
  observationCount?: number;
}

type RunStatus = "success" | "partial-success" | "failure";

interface DocumentationRunResult {
  status: RunStatus;
  moduleOutcomes: ModuleGenerationOutcome[];
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  warnings: string[];
  observationCount: number;
  costUsd: number | null;
}
```

Run status rules (evaluated in order, first match wins):
1. `failure`: more than half of modules failed (`failureCount > totalModules / 2`), or a critical pipeline-level error occurred
2. `partial-success`: at least one module failed but half or more succeeded
3. `success`: all modules generated successfully

The ">half failed" threshold means an even split (e.g., 5 of 10 failed) is `partial-success`, not `failure`.

CLI exit codes: `success` → 0, `partial-success` → 0 (warnings printed to stderr), `failure` → 1.

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] Failed modules produce placeholder pages on both agentic and one-shot paths
- [ ] Remaining modules continue after a failure
- [ ] Run result includes per-module success/failure breakdown
- [ ] Run status follows defined rules (success / partial-success / failure)
- [ ] One-shot fallback path has identical degradation behavior
- [ ] Per-module outcomes use same `ModuleGenerationOutcome` shape on both paths
- [ ] Validation reports placeholder pages as warnings
- [ ] Total run time ≤2x the current one-shot approach for the same repo
- [ ] `.doc-meta.json` format backward compatible with prior runs
- [ ] All existing CLI commands, flags, and output formats unchanged
- [ ] All tests pass
