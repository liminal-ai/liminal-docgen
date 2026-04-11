<!-- Source: docs/epics/agentic-module-generation-stories.md -->

## Story 1: Component Classification Enrichment

### Summary
<!-- Jira: Summary field -->

Every component gets a role and zone label after analysis; every module gets an archetype after planning.

### Description
<!-- Jira: Description field -->

**User Profile:**
- **Primary User:** Developer running `liminal-docgen generate` against their codebase
- **Context:** Generating or regenerating a documentation wiki for a repository, especially mid-to-large codebases (100+ components) with mixed architectural patterns
- **Mental Model:** "I point the tool at my repo and it produces a useful wiki that reflects my actual code structure"
- **Key Constraint:** Generation must complete reliably without manual intervention. Failures on individual modules should not abort the entire run.

**Objective:** After structural analysis produces the raw `RepositoryAnalysis`, run a deterministic classification enrichment step that labels each component with its architectural role and code zone. After module planning completes, assign each module an archetype based on its constituent component classifications. All classifications are available in agent context during generation.

The canonical pipeline order is:
analysis → component classification → strategy → planning → module archetype assignment → generation

**Scope:**

*In:*
- Component role classification from exports, file paths, and relationship patterns
- Component zone classification from directory conventions and file markers
- Module archetype classification from constituent component roles and zones
- Context assembly that includes classifications for agent consumption

*Out:*
- Inference-based classification (classification is deterministic heuristics only)
- Changes to the native analyzer's AST parsing or file discovery logic
- Strategy selection (Story 3)

**Dependencies:** Story 0 (type definitions)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-1.1:** Every component in the analysis output receives a role classification

- **TC-1.1a: Service role detected from export pattern**
  - Given: A component that exports a class with methods matching service patterns (e.g., `UserService`, `createUserHandler`)
  - When: Classification enrichment runs
  - Then: Component receives role `service` or `handler`
- **TC-1.1b: Type-definition role detected from export composition**
  - Given: A component that exports only interfaces, types, and enums
  - When: Classification enrichment runs
  - Then: Component receives role `type-definition`
- **TC-1.1c: Unknown role assigned when no pattern matches**
  - Given: A component whose exports and path don't match any known role pattern
  - When: Classification enrichment runs
  - Then: Component receives role `unknown` (not an error — this is expected for unfamiliar codebases)
- **TC-1.1d: Role classification is deterministic**
  - Given: The same analysis output run through classification twice
  - When: Both enrichments complete
  - Then: All role labels are identical

**AC-1.2:** Every component receives a zone classification

- **TC-1.2a: Test zone detected from directory convention**
  - Given: A component at path `test/orchestration/generate.test.ts`
  - When: Classification enrichment runs
  - Then: Component receives zone `test`
- **TC-1.2b: Production zone is the default**
  - Given: A component at path `src/orchestration/generate.ts` with no test/generated/vendor indicators
  - When: Classification enrichment runs
  - Then: Component receives zone `production`
- **TC-1.2c: Generated zone detected from markers**
  - Given: A component in a directory named `generated/` or containing auto-generation markers
  - When: Classification enrichment runs
  - Then: Component receives zone `generated`
- **TC-1.2d: Vendored zone detected from directory convention**
  - Given: A component in a directory named `vendor/` or `vendored/` or `third-party/`
  - When: Classification enrichment runs
  - Then: Component receives zone `vendored`
- **TC-1.2e: Infrastructure zone detected from CI/deploy paths**
  - Given: A component at path `.github/workflows/ci.yml` or `docker/Dockerfile`
  - When: Classification enrichment runs
  - Then: Component receives zone `infrastructure`
- **TC-1.2f: Build-script zone detected from scripts directory**
  - Given: A component at path `scripts/build.ts` or `scripts/release.sh`
  - When: Classification enrichment runs
  - Then: Component receives zone `build-script`

**AC-1.3:** Every planned module receives an archetype classification

- **TC-1.3a: Orchestration archetype from constituent roles**
  - Given: A module whose components are predominantly `handler`, `service`, and `controller` roles with high cross-module relationship density
  - When: Module classification runs after planning
  - Then: Module receives archetype `orchestration`
- **TC-1.3b: Type-definition archetype from homogeneous roles**
  - Given: A module whose components are all `type-definition` role
  - When: Module classification runs after planning
  - Then: Module receives archetype `type-definitions`
- **TC-1.3c: Mixed archetype when no dominant pattern**
  - Given: A module with an even mix of roles
  - When: Module classification runs after planning
  - Then: Module receives archetype `mixed`
- **TC-1.3d: Domain-model archetype from model-heavy module**
  - Given: A module whose components are predominantly `model` role with few cross-module dependencies
  - When: Module classification runs after planning
  - Then: Module receives archetype `domain-model`
- **TC-1.3e: Test-suite archetype from test-zone module**
  - Given: A module whose components are all in zone `test`
  - When: Module classification runs after planning
  - Then: Module receives archetype `test-suite`

**AC-1.4:** Classifications are available in agent context during module generation

- **TC-1.4a: Agent receives component roles for its module**
  - Given: A module being generated by an agent
  - When: Agent context is assembled
  - Then: Each component's role and zone labels are included in the context
- **TC-1.4b: Agent receives module archetype**
  - Given: A module being generated by an agent
  - When: Agent context is assembled
  - Then: Module archetype label is included in the context

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

```typescript
type ComponentRole =
  | "service" | "handler" | "controller" | "model" | "repository"
  | "adapter" | "factory" | "utility" | "configuration" | "entry-point"
  | "middleware" | "validator" | "type-definition" | "test" | "fixture"
  | "script" | "unknown";

type CodeZone =
  | "production" | "test" | "generated" | "vendored"
  | "infrastructure" | "configuration" | "build-script" | "documentation";

type ModuleArchetype =
  | "orchestration" | "data-access" | "public-api" | "domain-model"
  | "integration" | "utility-collection" | "type-definitions"
  | "infrastructure" | "test-suite" | "mixed";

interface ClassifiedComponent extends AnalyzedComponent {
  role: ComponentRole;
  zone: CodeZone;
}

interface ClassifiedModule extends PlannedModule {
  archetype: ModuleArchetype;
}
```

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] Every component receives a role label after analysis
- [ ] Every component receives a zone label after analysis
- [ ] Every module receives an archetype label after planning
- [ ] Classification is deterministic (same input produces identical output)
- [ ] Classifications are included in agent context assembly
- [ ] Enrichment completes in <1s for repos under 500 components
- [ ] All tests pass
