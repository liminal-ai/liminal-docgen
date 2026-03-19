import { describe, expect, it } from "vitest";
import {
  type ClassifiedComponentData,
  mergeComponentView,
} from "../../src/classification/types.js";

describe("mergeComponentView", () => {
  const classificationMap = new Map<string, ClassifiedComponentData>([
    [
      "src/services/user-service.ts",
      { role: "service", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/types/common.ts",
      {
        role: "type-definition",
        roleConfidence: "confirmed",
        zone: "production",
      },
    ],
  ]);

  it("returns correct view when classification exists", () => {
    const component = {
      filePath: "src/services/user-service.ts",
      language: "typescript",
      exportedSymbols: [{ name: "UserService", kind: "class", lineNumber: 10 }],
      linesOfCode: 120,
    };

    const view = mergeComponentView(component, classificationMap);

    expect(view).not.toBeNull();
    expect(view?.filePath).toBe("src/services/user-service.ts");
    expect(view?.language).toBe("typescript");
    expect(view?.role).toBe("service");
    expect(view?.roleConfidence).toBe("confirmed");
    expect(view?.zone).toBe("production");
    expect(view?.linesOfCode).toBe(120);
    expect(view?.exportedSymbols).toHaveLength(1);
    expect(view?.exportedSymbols?.[0]?.name).toBe("UserService");
  });

  it("returns null when classification doesn't exist for path", () => {
    const component = {
      filePath: "src/unknown/file.ts",
      language: "typescript",
      exportedSymbols: [],
      linesOfCode: 10,
    };

    const view = mergeComponentView(component, classificationMap);

    expect(view).toBeNull();
  });

  it("preserves all fields from both sources", () => {
    const component = {
      filePath: "src/types/common.ts",
      language: "typescript",
      exportedSymbols: [
        { name: "Result", kind: "type", lineNumber: 1 },
        { name: "ErrorCode", kind: "type", lineNumber: 10 },
        { name: "Status", kind: "enum", lineNumber: 20 },
      ],
      linesOfCode: 40,
    };

    const view = mergeComponentView(component, classificationMap);

    expect(view).not.toBeNull();
    expect(view?.filePath).toBe("src/types/common.ts");
    expect(view?.language).toBe("typescript");
    expect(view?.linesOfCode).toBe(40);
    expect(view?.exportedSymbols).toHaveLength(3);
    expect(view?.role).toBe("type-definition");
    expect(view?.roleConfidence).toBe("confirmed");
    expect(view?.zone).toBe("production");
  });

  it("handles component with empty exports array", () => {
    const component = {
      filePath: "src/services/user-service.ts",
      language: "typescript",
      exportedSymbols: [],
      linesOfCode: 0,
    };

    const view = mergeComponentView(component, classificationMap);

    expect(view).not.toBeNull();
    expect(view?.exportedSymbols).toHaveLength(0);
    expect(view?.role).toBe("service");
  });

  it("returns null for empty classification map", () => {
    const component = {
      filePath: "src/services/user-service.ts",
      language: "typescript",
      exportedSymbols: [],
      linesOfCode: 10,
    };

    const emptyMap = new Map<string, ClassifiedComponentData>();
    const view = mergeComponentView(component, emptyMap);

    expect(view).toBeNull();
  });
});
