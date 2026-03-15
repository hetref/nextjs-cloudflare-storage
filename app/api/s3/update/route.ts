import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { S3, S3_BUCKET_NAME } from "@/lib/S3Client";

const updateRequestSchema = z.object({
  key: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().nonnegative(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = updateRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const { key, contentType, size } = validation.data;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });

    const presignedUrl = await getSignedUrl(S3, command, {
      expiresIn: 360,
    });

    return NextResponse.json({ presignedUrl, key });
  } catch (error) {
    console.error("Failed to generate update URL:", error);
    return NextResponse.json(
      { error: "Failed to generate update URL." },
      { status: 500 }
    );
  }
}
