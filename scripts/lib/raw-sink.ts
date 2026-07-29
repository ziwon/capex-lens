import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { RawPayload, RawPayloadSink } from "@capex-lens/providers";

export interface RawManifestEntry extends Omit<RawPayload, "body"> {
  localPath: string;
}

export function createFileRawSink(outputDirectory: string): { sink: RawPayloadSink; entries: RawManifestEntry[] } {
  const entries: RawManifestEntry[] = [];
  const root = resolve(outputDirectory, "raw");

  const sink: RawPayloadSink = async (payload) => {
    const localPath = resolve(root, payload.objectKey);
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, payload.body, "utf8");
    entries.push({
      provider: payload.provider,
      sourceId: payload.sourceId,
      objectKey: payload.objectKey,
      sourceLocator: payload.sourceLocator,
      fetchedAt: payload.fetchedAt,
      contentType: payload.contentType,
      contentHash: payload.contentHash,
      schemaVersion: payload.schemaVersion,
      license: payload.license,
      localPath,
    });
  };

  return { sink, entries };
}
