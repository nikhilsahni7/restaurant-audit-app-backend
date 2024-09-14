import { PDFDocument, rgb } from "pdf-lib";
import uploadPdfToS3 from "../utils/pdfUploader.js";
import { promises as fs } from "fs";
import path from "path";
import Audit from "../models/TaskModel.js";
import AuditVersion from "../models/PdfModel.js";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/UserModel.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import axios from "axios";
import cloudinary from "../config/cloudinary.js";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

export const userRegistration = asyncHandler(async (req, res) => {
  try {
    const { name, email, phoneNumber, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      name,
      email,
      phoneNumber,
      password: hashedPassword,
      memberSince: Date.now(),
    });

    const savedUser = await user.save();

    // Create JWT token
    const token = jwt.sign({ userId: savedUser._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(201).json({
      message: "User registered successfully",
      token,
      userId: savedUser._id,
      name: savedUser.name,
      email: savedUser.email,
      phoneNumber: savedUser.phoneNumber,
    });
  } catch (err) {
    return res.status(500).json({ message: `Internal Server Error ${err}` });
  }
});

export const userLogin = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Increment login count and update last login
    user.lastLogin = Date.now(); // Update lastLogin to current time
    user.loginCount += 1; // Increment loginCount

    await user.save(); // Save changes to the database

    // Create JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.json({
      message: "User logged in successfully",
      token,
      userId: user._id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      lastLogin: user.lastLogin, // Return updated lastLogin
      loginCount: user.loginCount, // Return updated loginCount
    });
  } catch (err) {
    return res.status(500).json({ message: `Internal Server Error ${err}` });
  }
});

export const getUserDetails = asyncHandler(async (req, res) => {
  const userId = req.params.userId; // Get the user ID from the request params

  const user = await User.findById(userId).select("-password");

  if (user) {
    res.json({
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      memberSince: user.createdAt,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount,
    });
  } else {
    res.status(404).json({ message: "User not found" });
  }
});

// Fetch an audit template by ID (for users to fill out)
export const getAuditTemplateById = asyncHandler(async (req, res) => {
  try {
    const template = await Audit.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Audit template not found" });
    }
    res.status(200).json(template);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch audit template",
      error: error.message,
    });
  }
});

export const fillOrCreateAuditForm = asyncHandler(async (req, res) => {
  try {
    const {
      userId,
      nameOfCompany,
      fssaiLicenseNo,
      companyRepresentatives,
      siteAddress,
      state,
      pinCode,
      phoneNo,
      email,
      website,
      auditTeam,
      dateOfAudit,
      auditType,
      auditCriteria,
      typeOfAudit,
      scope,
      manpower,
      sections,
    } = req.body;

    // Find the existing audit template
    const template = await Audit.findById("66d20424946495897592bd0c");
    if (!template) {
      return res.status(404).json({ message: "Audit template not found" });
    }

    // Handle image uploads
    const updatedSections = await Promise.all(
      sections.map(async (section) => {
        if (section.image) {
          // Assume section.image is a base64 string
          const uploadResult = await cloudinary.uploader.upload(section.image, {
            folder: "audit_images",
          });
          return { ...section, image: uploadResult.secure_url };
        }
        return section;
      })
    );

    // Create a new audit form entry
    const newAuditForm = new Audit({
      userId,
      restaurantName: template.restaurantName,
      nameOfCompany,
      fssaiLicenseNo,
      companyRepresentatives,
      siteAddress,
      state,
      pinCode,
      phoneNo,
      email,
      website,
      auditTeam,
      dateOfAudit,
      auditType,
      auditCriteria,
      typeOfAudit,
      scope,
      manpower,
      sections: updatedSections,
      status: "FILLED",
      version: (template.version || 0) + 1,
    });

    const savedAuditForm = await newAuditForm.save();

    // Generate PDF
    const pdfPath = await generateAuditPdf(savedAuditForm);

    // Save version control information
    const auditVersion = new AuditVersion({
      userId,
      formId: savedAuditForm._id,
      versionNumber: savedAuditForm.version,
      pdfPath,
    });

    await auditVersion.save();

    res.status(201).json({
      message: "Audit form created successfully",
      pdfPath: pdfPath,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to create audit form", error: error.message });
  }
});

export const updateAuditForm = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nameOfCompany,
      fssaiLicenseNo,
      companyRepresentatives,
      siteAddress,
      state,
      pinCode,
      phoneNo,
      email,
      website,
      auditTeam,
      dateOfAudit,
      auditType,
      auditCriteria,
      typeOfAudit,
      scope,
      manpower,
      sections,
    } = req.body;

    // Find the existing audit form
    const existingAuditForm = await Audit.findById(id);
    if (!existingAuditForm) {
      return res.status(404).json({ message: "Audit form not found" });
    }

    // Update the audit form
    existingAuditForm.nameOfCompany =
      nameOfCompany || existingAuditForm.nameOfCompany;
    existingAuditForm.fssaiLicenseNo =
      fssaiLicenseNo || existingAuditForm.fssaiLicenseNo;
    existingAuditForm.companyRepresentatives =
      companyRepresentatives || existingAuditForm.companyRepresentatives;
    existingAuditForm.siteAddress =
      siteAddress || existingAuditForm.siteAddress;
    existingAuditForm.state = state || existingAuditForm.state;
    existingAuditForm.pinCode = pinCode || existingAuditForm.pinCode;
    existingAuditForm.phoneNo = phoneNo || existingAuditForm.phoneNo;
    existingAuditForm.email = email || existingAuditForm.email;
    existingAuditForm.website = website || existingAuditForm.website;
    existingAuditForm.auditTeam = auditTeam || existingAuditForm.auditTeam;
    existingAuditForm.dateOfAudit =
      dateOfAudit || existingAuditForm.dateOfAudit;
    existingAuditForm.auditType = auditType || existingAuditForm.auditType;
    existingAuditForm.auditCriteria =
      auditCriteria || existingAuditForm.auditCriteria;
    existingAuditForm.typeOfAudit =
      typeOfAudit || existingAuditForm.typeOfAudit;
    existingAuditForm.scope = scope || existingAuditForm.scope;
    existingAuditForm.manpower = manpower || existingAuditForm.manpower;
    existingAuditForm.sections = sections || existingAuditForm.sections;
    existingAuditForm.version += 1;

    const updatedAuditForm = await existingAuditForm.save();

    // Generate new PDF
    const pdfPath = await generateAuditPdf(updatedAuditForm);

    // Upload PDF to S3
    const s3Url = await uploadPdfToS3(
      pdfPath,
      `Audit_Form_${updatedAuditForm._id}_v${updatedAuditForm.version}.pdf`
    );

    // Save version control information
    const auditVersion = new AuditVersion({
      userId: updatedAuditForm.userId,
      formId: updatedAuditForm._id,
      versionNumber: updatedAuditForm.version,
      pdfUrl: s3Url,
    });
    await auditVersion.save();

    res.status(200).json({
      message: "Audit form updated successfully",
      pdfUrl: s3Url,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update audit form", error: error.message });
  }
});

const generateAuditPdf = async (auditForm) => {
  try {
    // Load the template PDF
    const templatePath = path.resolve(__dirname, "../templates/template.pdf");
    const templatePdfBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templatePdfBytes);
    const form = pdfDoc.getForm();
    const pages = pdfDoc.getPages();

    // Log all form field names for debugging
    console.log(
      "All form field names:",
      form.getFields().map((field) => field.getName())
    );

    // Fill in the form fields
    const fieldMappings = {
      cn: auditForm.nameOfCompany,
      fn: auditForm.fssaiLicenseNo,
      cr: auditForm.companyRepresentatives.join(", "),
      sa: auditForm.siteAddress,
      s: auditForm.state,
      pc: auditForm.pinCode,
      text_8soit: auditForm.phoneNo,
      w: auditForm.website,
      em: auditForm.email,
      at: auditForm.auditTeam.join(", "),
      atp: auditForm.auditType,
      ad: new Date(auditForm.dateOfAudit).toLocaleDateString(),
      ac: auditForm.auditCriteria,
      scp: auditForm.scope,
      mc: auditForm.manpower.male.toString(),
      fc: auditForm.manpower.female.toString(),
    };

    Object.entries(fieldMappings).forEach(([fieldName, value]) => {
      try {
        const field = form.getTextField(fieldName);
        if (field) {
          field.setText(value);
        } else {
          console.warn(`TextField ${fieldName} not found in the form.`);
        }
      } catch (error) {
        console.warn(
          `Error setting text for field ${fieldName}:`,
          error.message
        );
      }
    });

    // Handle checkboxes for audit type
    ["pat", "aat"].forEach((checkboxName) => {
      try {
        const checkbox = form.getCheckBox(checkboxName);
        if (checkbox) {
          auditForm.typeOfAudit ===
          (checkboxName === "pat" ? "Pre Assessment" : "Annual audit")
            ? checkbox.check()
            : checkbox.uncheck();
        } else {
          console.warn(`Checkbox ${checkboxName} not found in the form.`);
        }
      } catch (error) {
        console.warn(`Error handling checkbox ${checkboxName}:`, error.message);
      }
    });

    // Define color map based on compliance
    const colorMap = {
      Y: rgb(0.0, 1.0, 0.0), // Green for Compliance
      N: rgb(1.0, 0.0, 0.0), // Red for Not Compliance
      NI: rgb(1.0, 1.0, 0.0), // Yellow for Needs Improvement
      "N/A": rgb(0.5, 0.5, 0.5), // Gray for Not Applicable
    };

    // Fill in the sections and apply colors
    auditForm.sections.forEach((section, index) => {
      const questionNumber = index + 1;
      const textFieldName = `q${questionNumber}`;

      try {
        const textField = form.getTextField(textFieldName);
        if (textField) {
          textField.setText(section.evidenceAndComments);
          textField.setFontSize(10);

          const widget = textField.acroField.getWidgets()[0];
          const { x, y, width, height } = widget.getRectangle();

          const fieldPage = widget.P;
          const pageIndex = pdfDoc
            .getPages()
            .findIndex((page) => page.ref === fieldPage);

          if (pageIndex !== -1) {
            const page = pages[pageIndex];
            const backgroundColor = colorMap[section.compliance];
            if (backgroundColor) {
              page.drawRectangle({
                x,
                y,
                width,
                height,
                color: backgroundColor,
                opacity: 0.3,
              });
            }
          }
        } else {
          console.warn(`TextField ${textFieldName} not found in the form.`);
        }
      } catch (error) {
        console.warn(
          `Error processing text field ${textFieldName}:`,
          error.message
        );
      }

      // Check the appropriate checkbox based on compliance
      const complianceMap = { Y: 1, N: 2, NI: 3, "N/A": 4 };
      const checkboxNumber = complianceMap[section.compliance];
      if (checkboxNumber) {
        const checkboxFieldName = `q${questionNumber}c${checkboxNumber}`;
        try {
          const checkbox = form.getCheckBox(checkboxFieldName);
          if (checkbox) {
            checkbox.check();
          } else {
            console.warn(
              `Checkbox ${checkboxFieldName} not found in the form.`
            );
          }
        } catch (error) {
          console.warn(
            `Error checking checkbox ${checkboxFieldName}:`,
            error.message
          );
        }
      }
    });

    // Add a new page for images
    const imagePage = pdfDoc.addPage();

    // Calculate the number of images to be added
    const imageSections = auditForm.sections.filter((section) => section.image);

    // Set up grid layout for images
    const imagesPerRow = 2;
    const imageWidth = 250;
    const imageHeight = 200;
    const margin = 50;

    for (let i = 0; i < imageSections.length; i++) {
      const section = imageSections[i];
      const row = Math.floor(i / imagesPerRow);
      const col = i % imagesPerRow;

      const x = margin + col * (imageWidth + margin);
      const y =
        imagePage.getHeight() - (margin + (row + 1) * (imageHeight + margin));

      try {
        // Fetch image from Cloudinary
        const response = await axios.get(section.image, {
          responseType: "arraybuffer",
        });
        const imageBuffer = Buffer.from(response.data);

        // Use sharp to determine the image format and convert if necessary
        const metadata = await sharp(imageBuffer).metadata();
        let processedImageBuffer;

        switch (metadata.format) {
          case "jpeg":
          case "jpg":
            processedImageBuffer = imageBuffer;
            break;
          case "png":
            processedImageBuffer = await sharp(imageBuffer).jpeg().toBuffer();
            break;
          case "webp":
            processedImageBuffer = await sharp(imageBuffer).jpeg().toBuffer();
            break;
          default:
            throw new Error(`Unsupported image format: ${metadata.format}`);
        }

        // Embed image in PDF
        const embeddedImage = await pdfDoc.embedJpg(processedImageBuffer);
        imagePage.drawImage(embeddedImage, {
          x,
          y,
          width: imageWidth,
          height: imageHeight,
        });

        // Add text below the image
        imagePage.drawText(`Question: ${section.question}`, {
          x: x,
          y: y - 20,
          size: 10,
        });
        imagePage.drawText(`Compliance: ${section.compliance}`, {
          x: x,
          y: y - 35,
          size: 10,
        });
        imagePage.drawText(`Evidence: ${section.evidenceAndComments}`, {
          x: x,
          y: y - 50,
          size: 10,
          maxWidth: imageWidth,
        });
      } catch (imageError) {
        console.error(
          `Error processing image for section ${i + 1}:`,
          imageError
        );
        // Add an error message instead of the image
        imagePage.drawText(`Error loading image for Question ${i + 1}`, {
          x,
          y,
          size: 12,
          color: rgb(1, 0, 0), // Red color
        });
      }
    }

    // Make form read-only
    form.getFields().forEach((field) => {
      try {
        field.enableReadOnly();
      } catch (error) {
        console.warn(
          `Error setting read-only for field ${field.getName()}:`,
          error.message
        );
      }
    });

    // Generate the PDF bytes in-memory
    const pdfBytes = await pdfDoc.save();
    const pdfName = `Audit_Form_${auditForm._id}_v${auditForm.version}.pdf`;

    // Upload the PDF directly to S3
    const s3Url = await uploadPdfToS3(pdfBytes, pdfName);

    // Return the S3 URL
    return s3Url;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

export default generateAuditPdf;

export const getUserFilledAuditForms = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    const filledTemplates = await Audit.find({
      userId: userId,
      status: "FILLED",
    }).sort({ version: -1 }); // Sort by version in descending order

    if (!filledTemplates.length) {
      return res
        .status(404)
        .json({ message: "No filled audit forms found for this user" });
    }

    res.status(200).json({
      message: "Filled audit forms retrieved successfully",
      templates: filledTemplates,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch filled audit forms",
      error: error.message,
    });
  }
});

// Fetch a specific version of an audit form filled by a user
export const getAuditFormVersionById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Audit.findOne({ _id: id });

    if (!template) {
      return res.status(404).json({ message: "Audit form version not found" });
    }

    res.status(200).json(template);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch audit form version",
      error: error.message,
    });
  }
});

// Delete an audit form filled by a user
export const deleteAuditForm = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const deletedTemplate = await Audit.findByIdAndDelete(id);

    if (!deletedTemplate) {
      return res.status(404).json({ message: "Audit form not found" });
    }

    res.status(200).json({ message: "Audit form deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete audit form", error: error.message });
  }
});

export const getPdfPathForForm = asyncHandler(async (req, res) => {
  try {
    const { formId } = req.params;

    // Find the latest version of the audit form
    const latestVersion = await AuditVersion.findOne({ formId: formId })
      .sort({ versionNumber: -1 })
      .select("pdfPath versionNumber");

    if (!latestVersion) {
      return res
        .status(404)
        .json({ message: "No audit version found for this form ID" });
    }

    res.status(200).json({
      message: "PDF path retrieved successfully",
      formId: formId,
      versionNumber: latestVersion.versionNumber,
      pdfPath: latestVersion.pdfPath,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to retrieve PDF path",
      error: error.message,
    });
  }
});
