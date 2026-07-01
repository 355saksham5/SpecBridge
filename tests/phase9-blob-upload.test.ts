import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resolveBlobUploadConfig } from "../apps/knowledge-worker/src/blob-upload.js";

describe("blob-upload", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.SPECBRIDGE_BLOB_CONNECTION_STRING;
    delete process.env.SPECBRIDGE_BLOB_CONTAINER;
  });

  afterEach(() => {
    process.env = env;
  });

  it("builds blob name from organization and job ids", () => {
    process.env.SPECBRIDGE_BLOB_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const config = resolveBlobUploadConfig(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    );
    expect(config).toEqual({
      connectionString: "UseDevelopmentStorage=true",
      containerName: "bundles",
      blobName: "11111111111111111111111111111111/22222222222222222222222222222222/specbridge-bundle.zip",
    });
  });

  it("returns null when blob connection string is missing", () => {
    expect(resolveBlobUploadConfig("org", "job")).toBeNull();
  });
});
