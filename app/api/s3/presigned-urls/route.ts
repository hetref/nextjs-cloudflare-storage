import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { S3, S3_BUCKET_NAME } from "@/lib/S3Client";
const MAX_BATCH_SIZE = 100;

const presignedUrlRequestSchema = z.object({
  keys: z.array(z.string().min(1)).min(1).max(MAX_BATCH_SIZE),
  expiresIn: z.number().int().min(60).max(3600).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = presignedUrlRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const { keys, expiresIn = 300 } = validation.data;

    const urls = await Promise.all(
      keys.map(async (key) => {
        const command = new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: key,
        });

        const url = await getSignedUrl(S3, command, {
          expiresIn,
        });

        return {
          key,
          url,
        };
      })
    );

    return NextResponse.json({ urls });
  } catch (error) {
    console.error("Failed to generate presigned view URLs:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URLs." },
      { status: 500 }
    );
  }
}
