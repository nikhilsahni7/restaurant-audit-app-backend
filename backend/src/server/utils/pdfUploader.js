import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs/promises";
import s3Client from "../config/s3config.js";
import dotenv from "dotenv";
dotenv.config();

export default async function uploadPdfToS3(pdfBytes, pdfName) {
  try {
    // Use the in-memory pdfBytes directly
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: pdfName,
        Body: pdfBytes, // Directly pass the Uint8Array (pdfBytes)
        ContentType: "application/pdf",
      },
    });

    const result = await upload.done();
    console.log(`File uploaded successfully. ETag: ${result.ETag}`);

    // Construct and return the CloudFront URL
    const cloudfrontUrl = `https://${process.env.CLOUDFRONT_DOMAIN_NAME}/${pdfName}`;
    return cloudfrontUrl;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw error;
  }
}
