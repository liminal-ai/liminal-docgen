import type { RepositoryAnalysis } from "../../src/types/analysis.js";

/**
 * Standard TypeScript repository with 20+ components across various roles and zones.
 */
export const standardTsRepoAnalysis: RepositoryAnalysis = {
  repoPath: "/repo/standard-ts",
  commitHash: "abc123",
  focusDirs: [],
  summary: {
    totalFilesAnalyzed: 22,
    totalComponents: 22,
    totalRelationships: 18,
    languagesFound: ["typescript"],
    languagesSkipped: [],
  },
  components: {
    "src/services/user-service.ts": {
      filePath: "src/services/user-service.ts",
      language: "typescript",
      linesOfCode: 120,
      exportedSymbols: [{ name: "UserService", kind: "class", lineNumber: 10 }],
    },
    "src/services/auth-service.ts": {
      filePath: "src/services/auth-service.ts",
      language: "typescript",
      linesOfCode: 85,
      exportedSymbols: [{ name: "AuthService", kind: "class", lineNumber: 5 }],
    },
    "src/handlers/user-handler.ts": {
      filePath: "src/handlers/user-handler.ts",
      language: "typescript",
      linesOfCode: 60,
      exportedSymbols: [{ name: "UserHandler", kind: "class", lineNumber: 8 }],
    },
    "src/controllers/api-controller.ts": {
      filePath: "src/controllers/api-controller.ts",
      language: "typescript",
      linesOfCode: 95,
      exportedSymbols: [
        { name: "ApiController", kind: "class", lineNumber: 12 },
      ],
    },
    "src/models/user.ts": {
      filePath: "src/models/user.ts",
      language: "typescript",
      linesOfCode: 45,
      exportedSymbols: [
        { name: "User", kind: "interface", lineNumber: 3 },
        { name: "UserRole", kind: "enum", lineNumber: 20 },
      ],
    },
    "src/models/session.ts": {
      filePath: "src/models/session.ts",
      language: "typescript",
      linesOfCode: 30,
      exportedSymbols: [{ name: "Session", kind: "interface", lineNumber: 1 }],
    },
    "src/repositories/user-repository.ts": {
      filePath: "src/repositories/user-repository.ts",
      language: "typescript",
      linesOfCode: 80,
      exportedSymbols: [
        { name: "UserRepository", kind: "class", lineNumber: 5 },
      ],
    },
    "src/adapters/email-adapter.ts": {
      filePath: "src/adapters/email-adapter.ts",
      language: "typescript",
      linesOfCode: 55,
      exportedSymbols: [{ name: "EmailAdapter", kind: "class", lineNumber: 7 }],
    },
    "src/utils/hash.ts": {
      filePath: "src/utils/hash.ts",
      language: "typescript",
      linesOfCode: 25,
      exportedSymbols: [
        { name: "hashPassword", kind: "function", lineNumber: 3 },
        { name: "verifyPassword", kind: "function", lineNumber: 15 },
      ],
    },
    "src/utils/format.ts": {
      filePath: "src/utils/format.ts",
      language: "typescript",
      linesOfCode: 40,
      exportedSymbols: [
        { name: "formatDate", kind: "function", lineNumber: 1 },
        { name: "formatCurrency", kind: "function", lineNumber: 12 },
        { name: "formatName", kind: "function", lineNumber: 25 },
      ],
    },
    "src/config/database.ts": {
      filePath: "src/config/database.ts",
      language: "typescript",
      linesOfCode: 20,
      exportedSymbols: [{ name: "dbConfig", kind: "variable", lineNumber: 5 }],
    },
    "src/middleware/auth-middleware.ts": {
      filePath: "src/middleware/auth-middleware.ts",
      language: "typescript",
      linesOfCode: 35,
      exportedSymbols: [
        { name: "authMiddleware", kind: "function", lineNumber: 3 },
      ],
    },
    "src/validators/user-validator.ts": {
      filePath: "src/validators/user-validator.ts",
      language: "typescript",
      linesOfCode: 50,
      exportedSymbols: [
        { name: "validateUser", kind: "function", lineNumber: 5 },
      ],
    },
    "src/types/common.ts": {
      filePath: "src/types/common.ts",
      language: "typescript",
      linesOfCode: 40,
      exportedSymbols: [
        { name: "Result", kind: "type", lineNumber: 1 },
        { name: "ErrorCode", kind: "type", lineNumber: 10 },
        { name: "Status", kind: "enum", lineNumber: 20 },
      ],
    },
    "src/index.ts": {
      filePath: "src/index.ts",
      language: "typescript",
      linesOfCode: 15,
      exportedSymbols: [{ name: "startApp", kind: "function", lineNumber: 8 }],
    },
    "src/factories/service-factory.ts": {
      filePath: "src/factories/service-factory.ts",
      language: "typescript",
      linesOfCode: 40,
      exportedSymbols: [
        { name: "ServiceFactory", kind: "class", lineNumber: 5 },
      ],
    },
    "test/services/user-service.test.ts": {
      filePath: "test/services/user-service.test.ts",
      language: "typescript",
      linesOfCode: 90,
      exportedSymbols: [],
    },
    "test/handlers/user-handler.test.ts": {
      filePath: "test/handlers/user-handler.test.ts",
      language: "typescript",
      linesOfCode: 75,
      exportedSymbols: [],
    },
    "test/fixtures/mock-users.ts": {
      filePath: "test/fixtures/mock-users.ts",
      language: "typescript",
      linesOfCode: 30,
      exportedSymbols: [{ name: "mockUsers", kind: "variable", lineNumber: 3 }],
    },
    "scripts/seed-db.ts": {
      filePath: "scripts/seed-db.ts",
      language: "typescript",
      linesOfCode: 50,
      exportedSymbols: [
        { name: "seedDatabase", kind: "function", lineNumber: 10 },
      ],
    },
    ".github/workflows/ci.ts": {
      filePath: ".github/workflows/ci.ts",
      language: "typescript",
      linesOfCode: 20,
      exportedSymbols: [],
    },
    "docs/api-reference.ts": {
      filePath: "docs/api-reference.ts",
      language: "typescript",
      linesOfCode: 15,
      exportedSymbols: [],
    },
  },
  relationships: [
    {
      source: "src/controllers/api-controller.ts",
      target: "src/services/user-service.ts",
      type: "import",
    },
    {
      source: "src/controllers/api-controller.ts",
      target: "src/services/auth-service.ts",
      type: "import",
    },
    {
      source: "src/controllers/api-controller.ts",
      target: "src/middleware/auth-middleware.ts",
      type: "import",
    },
    {
      source: "src/services/user-service.ts",
      target: "src/repositories/user-repository.ts",
      type: "import",
    },
    {
      source: "src/services/user-service.ts",
      target: "src/models/user.ts",
      type: "import",
    },
    {
      source: "src/services/auth-service.ts",
      target: "src/utils/hash.ts",
      type: "import",
    },
    {
      source: "src/services/auth-service.ts",
      target: "src/models/session.ts",
      type: "import",
    },
    {
      source: "src/handlers/user-handler.ts",
      target: "src/services/user-service.ts",
      type: "import",
    },
    {
      source: "src/handlers/user-handler.ts",
      target: "src/validators/user-validator.ts",
      type: "import",
    },
    {
      source: "src/repositories/user-repository.ts",
      target: "src/models/user.ts",
      type: "import",
    },
    {
      source: "src/adapters/email-adapter.ts",
      target: "src/config/database.ts",
      type: "import",
    },
    {
      source: "src/index.ts",
      target: "src/controllers/api-controller.ts",
      type: "import",
    },
    {
      source: "src/index.ts",
      target: "src/config/database.ts",
      type: "import",
    },
    {
      source: "src/factories/service-factory.ts",
      target: "src/services/user-service.ts",
      type: "import",
    },
    {
      source: "src/factories/service-factory.ts",
      target: "src/services/auth-service.ts",
      type: "import",
    },
    {
      source: "test/services/user-service.test.ts",
      target: "src/services/user-service.ts",
      type: "import",
    },
    {
      source: "test/handlers/user-handler.test.ts",
      target: "src/handlers/user-handler.ts",
      type: "import",
    },
    {
      source: "test/fixtures/mock-users.ts",
      target: "src/models/user.ts",
      type: "import",
    },
  ],
};

/**
 * Mixed-language repository (TypeScript + Python).
 */
export const mixedLanguageRepoAnalysis: RepositoryAnalysis = {
  repoPath: "/repo/mixed-lang",
  commitHash: "def456",
  focusDirs: [],
  summary: {
    totalFilesAnalyzed: 8,
    totalComponents: 8,
    totalRelationships: 4,
    languagesFound: ["typescript", "python"],
    languagesSkipped: [],
  },
  components: {
    "src/api/server.ts": {
      filePath: "src/api/server.ts",
      language: "typescript",
      linesOfCode: 80,
      exportedSymbols: [
        { name: "startServer", kind: "function", lineNumber: 5 },
      ],
    },
    "src/api/routes.ts": {
      filePath: "src/api/routes.ts",
      language: "typescript",
      linesOfCode: 60,
      exportedSymbols: [
        { name: "registerRoutes", kind: "function", lineNumber: 3 },
      ],
    },
    "src/types/api.ts": {
      filePath: "src/types/api.ts",
      language: "typescript",
      linesOfCode: 35,
      exportedSymbols: [
        { name: "ApiRequest", kind: "interface", lineNumber: 1 },
        { name: "ApiResponse", kind: "interface", lineNumber: 10 },
        { name: "HttpStatus", kind: "enum", lineNumber: 20 },
      ],
    },
    "scripts/process_data.py": {
      filePath: "scripts/process_data.py",
      language: "python",
      linesOfCode: 100,
      exportedSymbols: [
        { name: "process_batch", kind: "function", lineNumber: 15 },
      ],
    },
    "scripts/train_model.py": {
      filePath: "scripts/train_model.py",
      language: "python",
      linesOfCode: 150,
      exportedSymbols: [{ name: "train", kind: "function", lineNumber: 20 }],
    },
    "src/utils/logger.ts": {
      filePath: "src/utils/logger.ts",
      language: "typescript",
      linesOfCode: 30,
      exportedSymbols: [
        { name: "createLogger", kind: "function", lineNumber: 5 },
        { name: "logError", kind: "function", lineNumber: 18 },
      ],
    },
    "test/api/routes.test.ts": {
      filePath: "test/api/routes.test.ts",
      language: "typescript",
      linesOfCode: 70,
      exportedSymbols: [],
    },
    "src/config/app.ts": {
      filePath: "src/config/app.ts",
      language: "typescript",
      linesOfCode: 20,
      exportedSymbols: [{ name: "appConfig", kind: "variable", lineNumber: 3 }],
    },
  },
  relationships: [
    {
      source: "src/api/server.ts",
      target: "src/api/routes.ts",
      type: "import",
    },
    { source: "src/api/routes.ts", target: "src/types/api.ts", type: "import" },
    {
      source: "src/api/server.ts",
      target: "src/config/app.ts",
      type: "import",
    },
    {
      source: "test/api/routes.test.ts",
      target: "src/api/routes.ts",
      type: "import",
    },
  ],
};

/**
 * Small repository with fewer than 8 components.
 */
export const smallRepoAnalysis: RepositoryAnalysis = {
  repoPath: "/repo/small",
  commitHash: "ghi789",
  focusDirs: [],
  summary: {
    totalFilesAnalyzed: 4,
    totalComponents: 4,
    totalRelationships: 2,
    languagesFound: ["typescript"],
    languagesSkipped: [],
  },
  components: {
    "src/index.ts": {
      filePath: "src/index.ts",
      language: "typescript",
      linesOfCode: 20,
      exportedSymbols: [{ name: "main", kind: "function", lineNumber: 3 }],
    },
    "src/utils.ts": {
      filePath: "src/utils.ts",
      language: "typescript",
      linesOfCode: 30,
      exportedSymbols: [
        { name: "parseArgs", kind: "function", lineNumber: 1 },
        { name: "formatOutput", kind: "function", lineNumber: 15 },
      ],
    },
    "src/types.ts": {
      filePath: "src/types.ts",
      language: "typescript",
      linesOfCode: 15,
      exportedSymbols: [
        { name: "Config", kind: "interface", lineNumber: 1 },
        { name: "Options", kind: "type", lineNumber: 8 },
      ],
    },
    "test/index.test.ts": {
      filePath: "test/index.test.ts",
      language: "typescript",
      linesOfCode: 40,
      exportedSymbols: [],
    },
  },
  relationships: [
    { source: "src/index.ts", target: "src/utils.ts", type: "import" },
    { source: "src/index.ts", target: "src/types.ts", type: "import" },
  ],
};

/**
 * Type-only repository where all components are type definitions.
 */
export const typeOnlyRepoAnalysis: RepositoryAnalysis = {
  repoPath: "/repo/type-only",
  commitHash: "jkl012",
  focusDirs: [],
  summary: {
    totalFilesAnalyzed: 5,
    totalComponents: 5,
    totalRelationships: 3,
    languagesFound: ["typescript"],
    languagesSkipped: [],
  },
  components: {
    "src/types/user.ts": {
      filePath: "src/types/user.ts",
      language: "typescript",
      linesOfCode: 25,
      exportedSymbols: [
        { name: "User", kind: "interface", lineNumber: 1 },
        { name: "UserRole", kind: "type", lineNumber: 15 },
      ],
    },
    "src/types/order.ts": {
      filePath: "src/types/order.ts",
      language: "typescript",
      linesOfCode: 30,
      exportedSymbols: [
        { name: "Order", kind: "interface", lineNumber: 1 },
        { name: "OrderStatus", kind: "enum", lineNumber: 18 },
      ],
    },
    "src/types/product.ts": {
      filePath: "src/types/product.ts",
      language: "typescript",
      linesOfCode: 20,
      exportedSymbols: [
        { name: "Product", kind: "interface", lineNumber: 1 },
        { name: "ProductCategory", kind: "type", lineNumber: 12 },
      ],
    },
    "src/types/common.ts": {
      filePath: "src/types/common.ts",
      language: "typescript",
      linesOfCode: 15,
      exportedSymbols: [
        { name: "Result", kind: "type", lineNumber: 1 },
        { name: "ErrorCode", kind: "enum", lineNumber: 5 },
      ],
    },
    "src/types/index.ts": {
      filePath: "src/types/index.ts",
      language: "typescript",
      linesOfCode: 10,
      exportedSymbols: [
        { name: "User", kind: "type", lineNumber: 1 },
        { name: "Order", kind: "type", lineNumber: 2 },
        { name: "Product", kind: "type", lineNumber: 3 },
      ],
    },
  },
  relationships: [
    {
      source: "src/types/order.ts",
      target: "src/types/user.ts",
      type: "import",
    },
    {
      source: "src/types/order.ts",
      target: "src/types/product.ts",
      type: "import",
    },
    {
      source: "src/types/index.ts",
      target: "src/types/common.ts",
      type: "import",
    },
  ],
};

/**
 * Test-heavy repository where many components are in the test zone.
 */
export const testHeavyRepoAnalysis: RepositoryAnalysis = {
  repoPath: "/repo/test-heavy",
  commitHash: "mno345",
  focusDirs: [],
  summary: {
    totalFilesAnalyzed: 10,
    totalComponents: 10,
    totalRelationships: 6,
    languagesFound: ["typescript"],
    languagesSkipped: [],
  },
  components: {
    "src/core/engine.ts": {
      filePath: "src/core/engine.ts",
      language: "typescript",
      linesOfCode: 100,
      exportedSymbols: [{ name: "Engine", kind: "class", lineNumber: 5 }],
    },
    "src/core/parser.ts": {
      filePath: "src/core/parser.ts",
      language: "typescript",
      linesOfCode: 70,
      exportedSymbols: [{ name: "parse", kind: "function", lineNumber: 3 }],
    },
    "src/types/ast.ts": {
      filePath: "src/types/ast.ts",
      language: "typescript",
      linesOfCode: 40,
      exportedSymbols: [
        { name: "AstNode", kind: "interface", lineNumber: 1 },
        { name: "NodeType", kind: "type", lineNumber: 20 },
      ],
    },
    "test/core/engine.test.ts": {
      filePath: "test/core/engine.test.ts",
      language: "typescript",
      linesOfCode: 150,
      exportedSymbols: [],
    },
    "test/core/engine-edge-cases.test.ts": {
      filePath: "test/core/engine-edge-cases.test.ts",
      language: "typescript",
      linesOfCode: 120,
      exportedSymbols: [],
    },
    "test/core/parser.test.ts": {
      filePath: "test/core/parser.test.ts",
      language: "typescript",
      linesOfCode: 90,
      exportedSymbols: [],
    },
    "test/integration/full-pipeline.test.ts": {
      filePath: "test/integration/full-pipeline.test.ts",
      language: "typescript",
      linesOfCode: 200,
      exportedSymbols: [],
    },
    "test/fixtures/sample-ast.ts": {
      filePath: "test/fixtures/sample-ast.ts",
      language: "typescript",
      linesOfCode: 60,
      exportedSymbols: [{ name: "sampleAst", kind: "variable", lineNumber: 5 }],
    },
    "test/fixtures/mock-parser.ts": {
      filePath: "test/fixtures/mock-parser.ts",
      language: "typescript",
      linesOfCode: 40,
      exportedSymbols: [
        { name: "mockParser", kind: "variable", lineNumber: 3 },
      ],
    },
    "test/helpers/test-utils.ts": {
      filePath: "test/helpers/test-utils.ts",
      language: "typescript",
      linesOfCode: 30,
      exportedSymbols: [
        { name: "createTestContext", kind: "function", lineNumber: 1 },
        { name: "assertNodeEquals", kind: "function", lineNumber: 15 },
      ],
    },
  },
  relationships: [
    {
      source: "src/core/engine.ts",
      target: "src/core/parser.ts",
      type: "import",
    },
    {
      source: "src/core/parser.ts",
      target: "src/types/ast.ts",
      type: "import",
    },
    {
      source: "test/core/engine.test.ts",
      target: "src/core/engine.ts",
      type: "import",
    },
    {
      source: "test/core/parser.test.ts",
      target: "src/core/parser.ts",
      type: "import",
    },
    {
      source: "test/fixtures/sample-ast.ts",
      target: "src/types/ast.ts",
      type: "import",
    },
    {
      source: "test/integration/full-pipeline.test.ts",
      target: "src/core/engine.ts",
      type: "import",
    },
  ],
};
