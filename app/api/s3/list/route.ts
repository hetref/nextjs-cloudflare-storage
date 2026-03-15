import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { S3, S3_BUCKET_NAME } from "@/lib/S3Client";
const DEFAULT_MAX_KEYS = 50;
const MAX_ALLOWED_KEYS = 200;

function toSafeMaxKeys(value: string | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_KEYS;
  }

  return Math.min(Math.floor(parsed), MAX_ALLOWED_KEYS);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix") ?? "";
    const continuationToken = searchParams.get("continuationToken") ?? undefined;
    const maxKeys = toSafeMaxKeys(searchParams.get("maxKeys"));

    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET_NAME,
      Prefix: prefix,
      Delimiter: "/",
      ContinuationToken: continuationToken,
      MaxKeys: maxKeys,
    });

    const result = await S3.send(command);

    const folders = (result.CommonPrefixes ?? [])
      .map((entry) => entry.Prefix)
      .filter((entry): entry is string => Boolean(entry))
      .map((folderPrefix) => {
        const withoutCurrentPrefix = folderPrefix.slice(prefix.length).replace(/\/$/, "");

        return {
          name: withoutCurrentPrefix,
          prefix: folderPrefix,
        };
      });

    const files = (result.Contents ?? [])
      .filter((entry) => entry.Key && entry.Key !== prefix)
      .map((entry) => {
        const key = entry.Key as string;
        const name = key.slice(prefix.length);

        return {
          key,
          name,
          size: entry.Size ?? 0,
          lastModified: entry.LastModified?.toISOString() ?? null,
          eTag: entry.ETag ?? null,
        };
      });

    return NextResponse.json({
      prefix,
      folders,
      files,
      isTruncated: Boolean(result.IsTruncated),
      nextContinuationToken: result.NextContinuationToken ?? null,
      keyCount: result.KeyCount ?? 0,
      maxKeys,
    });
  } catch (error) {
    console.error("Failed to list bucket objects:", error);
    return NextResponse.json(
      { error: "Failed to list bucket objects." },
      { status: 500 }
    );
  }
}
