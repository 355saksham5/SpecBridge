import { Ajv, type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import type { HandoffArtifactType } from "./types.js";

const calibrationReportSchema = {
  type: "object",
  required: ["commitSha", "overlapPercent", "missedPaths", "hallucinatedPaths"],
  properties: {
    commitSha: { type: "string", pattern: "^[0-9a-f]{7,40}$" },
    overlapPercent: { type: "number", minimum: 0, maximum: 1 },
    missedPaths: { type: "array", items: { type: "string" } },
    hallucinatedPaths: { type: "array", items: { type: "string" } },
    predictedPaths: { type: "array", items: { type: "string" } },
    actualPaths: { type: "array", items: { type: "string" } },
  },
  additionalProperties: true,
};

const questionsSchema = {
  type: "object",
  required: ["commitSha", "questions"],
  properties: {
    commitSha: { type: "string" },
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "text"],
        properties: {
          id: { type: "string" },
          text: { type: "string", minLength: 10 },
          category: { type: "string" },
          relatedPaths: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  additionalProperties: true,
};

const curationProposalSchema = {
  type: "object",
  required: ["commitSha", "answers", "patches"],
  properties: {
    commitSha: { type: "string" },
    answers: {
      type: "array",
      items: {
        type: "object",
        required: ["questionId", "answer", "citations"],
        properties: {
          questionId: { type: "string" },
          answer: { type: "string" },
          citations: { type: "array", items: { type: "string" } },
        },
      },
    },
    patches: {
      type: "array",
      items: {
        type: "object",
        required: ["targetPath", "operation"],
        properties: {
          targetPath: { type: "string" },
          operation: { enum: ["replace", "append", "delete", "update_weight"] },
          content: { type: "string" },
          tokenDelta: { type: "number" },
        },
      },
    },
  },
  additionalProperties: true,
};

const auditVerdictSchema = {
  type: "object",
  required: ["commitSha", "overallPass", "tokenDelta", "patches"],
  properties: {
    commitSha: { type: "string" },
    overallPass: { type: "boolean" },
    tokenDelta: { type: "number" },
    scores: {
      type: "object",
      properties: {
        coverage: { type: "number", minimum: 0, maximum: 1 },
        precision: { type: "number", minimum: 0, maximum: 1 },
        citation: { type: "number", minimum: 0, maximum: 1 },
        tokenEfficiency: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    patches: {
      type: "array",
      items: {
        type: "object",
        required: ["targetPath", "approved"],
        properties: {
          targetPath: { type: "string" },
          approved: { type: "boolean" },
          reason: { type: "string" },
        },
      },
    },
  },
  additionalProperties: true,
};

const stackProfileSchema = {
  type: "object",
  required: ["detectedAt", "repoPath", "languages", "frameworks"],
  properties: {
    detectedAt: { type: "string", format: "date-time" },
    repoPath: { type: "string" },
    languages: { type: "array" },
    frameworks: { type: "array", items: { type: "string" } },
  },
  additionalProperties: true,
};

const SCHEMAS: Record<HandoffArtifactType, object> = {
  "stack-profile": stackProfileSchema,
  "calibration-report": calibrationReportSchema,
  questions: questionsSchema,
  "curation-proposal": curationProposalSchema,
  "audit-verdict": auditVerdictSchema,
};

const ajv = new Ajv({ allErrors: true, strict: false });
(addFormats as unknown as (instance: Ajv) => Ajv)(ajv);

export class HandoffValidator {
  validate(type: HandoffArtifactType, data: unknown): { valid: boolean; errors?: string[] } {
    const schema = SCHEMAS[type];
    const validateFn = ajv.compile(schema);
    const valid = validateFn(data);
    if (valid) return { valid: true };
    return {
      valid: false,
      errors: validateFn.errors?.map((e: ErrorObject) => `${e.instancePath} ${e.message}`) ?? ["Unknown validation error"],
    };
  }
}

export function artifactTypeFromFilename(filename: string): HandoffArtifactType | null {
  if (filename === "stack-profile.json") return "stack-profile";
  if (filename === "calibration-report.json") return "calibration-report";
  if (filename === "questions.json") return "questions";
  if (filename === "curation-proposal.json") return "curation-proposal";
  if (filename === "audit-verdict.json") return "audit-verdict";
  return null;
}
