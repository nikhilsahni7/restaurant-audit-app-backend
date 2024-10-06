import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
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

  const [template, updatedSections] = await Promise.all([
    Audit.findById("66d20424946495897592bd0c"),
    Promise.all(
      sections.map(async (section) => {
        if (section.image) {
          const uploadResult = await cloudinary.uploader.upload(section.image, {
            folder: "audit_images",
          });
          return { ...section, image: uploadResult.secure_url };
        }
        return section;
      })
    ),
  ]);

  if (!template) {
    return res.status(404).json({ message: "Audit template not found" });
  }

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

  const [savedAuditForm, pdfPath] = await Promise.all([
    newAuditForm.save(),
    generateAuditPdf(newAuditForm),
  ]);

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
});

export const updateAuditForm = asyncHandler(async (req, res) => {
  const { id } = req.params;
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

  const [existingAuditForm, updatedSections] = await Promise.all([
    Audit.findById(id),
    Promise.all(
      sections.map(async (section) => {
        if (section.image && section.image.startsWith("data:image")) {
          const uploadResult = await cloudinary.uploader.upload(section.image, {
            folder: "audit_images",
          });
          return { ...section, image: uploadResult.secure_url };
        }
        return section;
      })
    ),
  ]);

  if (!existingAuditForm) {
    return res.status(404).json({ message: "Audit form not found" });
  }

  const updatedAuditForm = await Audit.findByIdAndUpdate(
    id,
    {
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
      dateOfAudit: new Date(dateOfAudit).toISOString(),
      auditType,
      auditCriteria,
      typeOfAudit,
      scope,
      manpower,
      sections: updatedSections,
      version: existingAuditForm.version + 1,
    },
    { new: true }
  );

  const pdfPath = await generateAuditPdf(updatedAuditForm);

  const auditVersion = new AuditVersion({
    userId: updatedAuditForm.userId,
    formId: updatedAuditForm._id,
    versionNumber: updatedAuditForm.version,
    pdfPath,
  });
  await auditVersion.save();

  res.status(200).json({
    message: "Audit form updated successfully",
    pdfPath: pdfPath,
  });
});

const generateAuditPdf = async (auditForm) => {
  const templatePath = path.resolve(__dirname, "../templates/template.pdf");
  const templatePdfBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templatePdfBytes);
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();

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
    const field = form.getTextField(fieldName);
    if (field) field.setText(value);
  });

  ["pat", "aat"].forEach((checkboxName) => {
    const checkbox = form.getCheckBox(checkboxName);
    if (checkbox) {
      auditForm.typeOfAudit ===
      (checkboxName === "pat" ? "Pre Assessment" : "Annual audit")
        ? checkbox.check()
        : checkbox.uncheck();
    }
  });

  const colorMap = {
    Y: rgb(0.0, 1.0, 0.0),
    N: rgb(1.0, 0.0, 0.0),
    NI: rgb(1.0, 1.0, 0.0),
    "N/A": rgb(0.5, 0.5, 0.5),
  };

  const complianceMap = { Y: 1, N: 2, NI: 3, "N/A": 4 };

  auditForm.sections.forEach((section, index) => {
    const questionNumber = index + 1;
    const textFieldName = `q${questionNumber}`;
    const textField = form.getTextField(textFieldName);

    if (textField) {
      textField.setText(section.evidenceAndComments);
      textField.setFontSize(10);

      const widget = textField.acroField.getWidgets()[0];
      const { x, y, width, height } = widget.getRectangle();
      const fieldPage = widget.P;
      const pageIndex = pages.findIndex((page) => page.ref === fieldPage);

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
    }

    const checkboxNumber = complianceMap[section.compliance];
    if (checkboxNumber) {
      const checkboxFieldName = `q${questionNumber}c${checkboxNumber}`;
      const checkbox = form.getCheckBox(checkboxFieldName);
      if (checkbox) checkbox.check();
    }
  });

  const imageSections = auditForm.sections.filter((section) => section.image);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 10;
  const lineHeight = 15;

  for (const section of imageSections) {
    const imagePage = pdfDoc.addPage();
    const { width, height } = imagePage.getSize();
    const margin = 50;
    const imageWidth = width - 2 * margin;
    const imageHeight = height * 0.6;

    try {
      const response = await axios.get(section.image, {
        responseType: "arraybuffer",
      });
      const imageBuffer = Buffer.from(response.data);
      const metadata = await sharp(imageBuffer).metadata();
      let processedImageBuffer = imageBuffer;

      if (metadata.format !== "jpeg" && metadata.format !== "jpg") {
        processedImageBuffer = await sharp(imageBuffer).jpeg().toBuffer();
      }

      const embeddedImage = await pdfDoc.embedJpg(processedImageBuffer);
      imagePage.drawImage(embeddedImage, {
        x: margin,
        y: height - margin - imageHeight,
        width: imageWidth,
        height: imageHeight,
      });

      const drawWrappedText = (text, yPosition) => {
        const words = text.split(" ");
        let line = "";
        let currentY = yPosition;

        words.forEach((word) => {
          const testLine = line + word + " ";
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);

          if (testWidth > imageWidth) {
            imagePage.drawText(line, {
              x: margin,
              y: currentY,
              size: fontSize,
              font: font,
            });
            line = word + " ";
            currentY -= lineHeight;
          } else {
            line = testLine;
          }
        });

        imagePage.drawText(line, {
          x: margin,
          y: currentY,
          size: fontSize,
          font: font,
        });
        return currentY - lineHeight;
      };

      let textY = height - margin - imageHeight - lineHeight;
      textY = drawWrappedText(`Question: ${section.question}`, textY);
      textY = drawWrappedText(`Compliance: ${section.compliance}`, textY);
      drawWrappedText(`Evidence: ${section.evidenceAndComments}`, textY);
    } catch (imageError) {
      console.error(`Error processing image:`, imageError);
      imagePage.drawText(`Error loading image`, {
        x: margin,
        y: height - margin,
        size: 12,
        color: rgb(1, 0, 0),
        font: font,
      });
    }
  }

  form.getFields().forEach((field) => field.enableReadOnly());

  const pdfBytes = await pdfDoc.save();
  const pdfName = `Audit_Form_${auditForm._id}_v${auditForm.version}.pdf`;

  return uploadPdfToS3(pdfBytes, pdfName);
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
