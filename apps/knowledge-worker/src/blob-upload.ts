import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export type UploadBundleOptions = {
  connectionString: string;
  containerName: string;
  blobName: string;
  localZipPath: string;
};

export type UploadBundleResult = {
  blobName: string;
  sizeBytes: number;
};

/**
 * Uploads a job bundle ZIP to Azure Blob Storage. Returns null when blob is not configured.
 */
export async function uploadBundleBlob(options: UploadBundleOptions): Promise<UploadBundleResult | null> {
  const { connectionString, containerName, blobName, localZipPath } = options;
  if (!connectionString || !containerName || !blobName || !localZipPath) {
    return null;
  }

  if (blobName.length > 512) {
    throw new Error("blobName exceeds maximum length of 512 characters");
  }

  const fileStat = await stat(localZipPath);
  const { BlobServiceClient } = await import("@azure/storage-blob");
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(containerName);
  await container.createIfNotExists();
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.uploadStream(createReadStream(localZipPath), fileStat.size, 4, {
    blobHTTPHeaders: { blobContentType: "application/zip" },
  });

  return { blobName, sizeBytes: fileStat.size };
}

export function resolveBlobUploadConfig(organizationId?: string, jobId?: string): {
  connectionString: string;
  containerName: string;
  blobName: string;
} | null {
  const connectionString = process.env.SPECBRIDGE_BLOB_CONNECTION_STRING;
  const containerName = process.env.SPECBRIDGE_BLOB_CONTAINER ?? "bundles";
  if (!connectionString || !organizationId || !jobId) {
    return null;
  }

  const blobName = `${organizationId.replace(/-/g, "")}/${jobId.replace(/-/g, "")}/specbridge-bundle.zip`;
  return { connectionString, containerName, blobName };
}
