import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

export const S3_BUCKET_NAME = "aryu-portfolio";

export const S3 = new S3Client({
  region: "auto",
  endpoint: "https://121f5c9dbb21926a5656c4562b25346e.r2.cloudflarestorage.com",
  forcePathStyle: true,
});
