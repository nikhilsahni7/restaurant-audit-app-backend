import { Upload } from "@aws-sdk/lib-storage";
import { S3 } from "@aws-sdk/client-s3";
import fs from "fs/promises";
import s3Client from "../config/s3config.js";
import dotenv from "dotenv"
dotenv.config();

export default async function uploadPdfToS3(pdfPath, pdfName) {
  try {
    const fileContent = await fs.readFile(pdfPath);

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: pdfName,
        Body: fileContent,
        ContentType: "application/pdf"
      }
    });

    const result = await upload.done();
    console.log(`File uploaded successfully. ETag: ${result.ETag}`);
    return result.Location;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw error;
  }
}