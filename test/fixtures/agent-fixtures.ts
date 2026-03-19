import type {
  AgentEntityCandidate,
  AgentFlowCandidate,
  AgentModuleContext,
  ComponentClassificationView,
} from "../../src/agent/types.js";

/**
 * Creates a mock AgentModuleContext with realistic data for a typical
 * service-oriented module. Use as a base and override fields as needed.
 */
export function createMockAgentModuleContext(
  overrides: Partial<AgentModuleContext> = {},
): AgentModuleContext {
  const defaultClassifications = new Map<string, ComponentClassificationView>([
    ["src/services/user-service.ts", { role: "service", zone: "production" }],
    [
      "src/repositories/user-repository.ts",
      { role: "repository", zone: "production" },
    ],
    ["src/models/user.ts", { role: "model", zone: "production" }],
  ]);

  return {
    moduleName: "User Management",
    moduleDescription:
      "Manages user creation, authentication, and profile operations",
    moduleArchetype: "orchestration",
    componentPaths: [
      "src/services/user-service.ts",
      "src/repositories/user-repository.ts",
      "src/models/user.ts",
    ],
    componentClassifications:
      overrides.componentClassifications ?? defaultClassifications,
    entityCandidates: overrides.entityCandidates ?? defaultEntityCandidates,
    flowCandidates: overrides.flowCandidates ?? defaultFlowCandidates,
    internalRelationships: overrides.internalRelationships ?? [
      "user-service.ts imports user-repository.ts",
      "user-service.ts imports user.ts",
      "user-repository.ts imports user.ts",
    ],
    crossModuleRelationships: overrides.crossModuleRelationships ?? [
      "api-controller.ts (API module) imports user-service.ts",
    ],
    sourceCoverage: overrides.sourceCoverage ?? [
      "src/services/user-service.ts",
      "src/repositories/user-repository.ts",
      "src/models/user.ts",
    ],
    zoneGuidance: overrides.zoneGuidance ?? "document",
    otherModuleNames: overrides.otherModuleNames ?? [
      "API Layer",
      "Authentication",
      "Configuration",
    ],
    ...overrides,
  };
}

const defaultEntityCandidates: AgentEntityCandidate[] = [
  {
    name: "UserService",
    kind: "class",
    filePath: "src/services/user-service.ts",
    publicEntrypoints: ["createUser", "getUser", "updateUser", "deleteUser"],
    dependsOn: ["UserRepository", "User"],
    usedBy: ["ApiController"],
  },
  {
    name: "UserRepository",
    kind: "class",
    filePath: "src/repositories/user-repository.ts",
    publicEntrypoints: ["findById", "save", "delete"],
    dependsOn: ["User"],
    usedBy: ["UserService"],
  },
  {
    name: "User",
    kind: "interface",
    filePath: "src/models/user.ts",
    publicEntrypoints: [],
    dependsOn: [],
    usedBy: ["UserService", "UserRepository"],
  },
];

const defaultFlowCandidates: AgentFlowCandidate[] = [
  {
    actor: "ApiController",
    action: "createUser",
    output: "User",
    target: "UserService",
    weight: 3,
  },
  {
    actor: "UserService",
    action: "save",
    output: "User",
    target: "UserRepository",
    weight: 2,
  },
];

/**
 * Creates a minimal agent module context for a type-definitions module.
 */
export function createTypeOnlyModuleContext(
  overrides: Partial<AgentModuleContext> = {},
): AgentModuleContext {
  const classifications = new Map<string, ComponentClassificationView>([
    ["src/types/common.ts", { role: "type-definition", zone: "production" }],
    ["src/types/api.ts", { role: "type-definition", zone: "production" }],
  ]);

  return {
    moduleName: "Type Definitions",
    moduleDescription: "Shared type definitions and interfaces",
    moduleArchetype: "type-definitions",
    componentPaths: ["src/types/common.ts", "src/types/api.ts"],
    componentClassifications: classifications,
    entityCandidates: [
      {
        name: "Result",
        kind: "type",
        filePath: "src/types/common.ts",
        publicEntrypoints: [],
        dependsOn: [],
        usedBy: [],
      },
    ],
    flowCandidates: [],
    internalRelationships: [],
    crossModuleRelationships: [],
    sourceCoverage: ["src/types/common.ts", "src/types/api.ts"],
    zoneGuidance: "document",
    otherModuleNames: ["Core", "API Layer"],
    ...overrides,
  };
}
