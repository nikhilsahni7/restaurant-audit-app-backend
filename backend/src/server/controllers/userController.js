import { PDFDocument, PDFTextField, PDFForm } from "pdf-lib";
import { promises as fs } from "fs";
import path from "path";
import Audit from "../models/TaskModel.js";
import AuditVersion from "../models/PdfModel.js";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/UserModel.js";
import dotenv from "dotenv";

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
    });
  } catch (err) {
    return res.status(500).json({ message: `Internal Server Error ${err}` });
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
    const { id } = req.params; // Template ID to fetch default values
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
    const template = await Audit.findById(id);
    if (!template) {
      return res.status(404).json({ message: "Audit template not found" });
    }

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
      sections,
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
      auditForm: savedAuditForm,
      pdfPath: pdfPath,
    });
  } catch (error) {
    // Fill in the static fields

    res
      .status(500)
      .json({ message: "Failed to create audit form", error: error.message });
  }
});

const generateAuditPdf = async (auditForm) => {
  const templatePath =
    "/home/nikhil-sahni/Coding/restaurant-audit-backend/backend/src/server/templates/audit-form.pdf";
  const templatePdfBytes = await fs.readFile(templatePath);

  // Load the PDF document
  const pdfDoc = await PDFDocument.load(templatePdfBytes);

  // Get the form from the document
  const form = pdfDoc.getForm();

  // Fill in the static fields
  fillStaticFields(form, auditForm);

  // Fill in the dynamic sections
  fillDynamicSections(form, auditForm.sections);

  // Save the PDF
  const pdfBytes = await pdfDoc.save();
  const pdfName = `Audit_Form_${auditForm._id}_v${auditForm.version}.pdf`;
  // Replace '/path/to/your/project/backend/pdfs' with your actual path
  const pdfPath =
    "/home/nikhil-sahni/Coding/restaurant-audit-backend/pdfs" + pdfName;

  await fs.mkdir(path.dirname(pdfPath), { recursive: true });
  await fs.writeFile(pdfPath, pdfBytes);

  return pdfPath;
};

const fillStaticFields = (form, auditForm) => {
  const fieldValues = [
    auditForm.nameOfCompany,
    auditForm.fssaiLicenseNo,
    auditForm.companyRepresentatives.join(", "),
    auditForm.siteAddress,
    auditForm.state,
    auditForm.pinCode,
    auditForm.phoneNo,
    auditForm.email,
    auditForm.website,
    auditForm.auditTeam.join(", "),
    new Date(auditForm.dateOfAudit).toLocaleDateString(),
    auditForm.auditType,
    auditForm.auditCriteria,
    auditForm.typeOfAudit,
    auditForm.scope,
    `Male: ${auditForm.manpower.male}, Female: ${auditForm.manpower.female}`,
  ];

  const fields = form.getFields();
  fields.forEach((field, index) => {
    if (field instanceof PDFTextField && index < fieldValues.length) {
      field.setText(fieldValues[index]);
    }
  });
};

const fillDynamicSections = (form, sections) => {
  const fields = form.getFields();
  let fieldIndex = 16; // Start after the static fields

  sections.forEach((section) => {
    if (
      fieldIndex < fields.length &&
      fields[fieldIndex] instanceof PDFTextField
    ) {
      fields[fieldIndex].setText(section.sectionTitle);
      fieldIndex++;
    }

    section.questions.forEach((question) => {
      if (
        fieldIndex < fields.length &&
        fields[fieldIndex] instanceof PDFTextField
      ) {
        fields[fieldIndex].setText(question.question);
        fieldIndex++;
      }
      if (
        fieldIndex < fields.length &&
        fields[fieldIndex] instanceof PDFTextField
      ) {
        fields[fieldIndex].setText(question.compliance);
        fieldIndex++;
      }
      if (
        fieldIndex < fields.length &&
        fields[fieldIndex] instanceof PDFTextField
      ) {
        fields[fieldIndex].setText(question.evidenceAndComments);
        fieldIndex++;
      }
    });
  });
};

export const getUserFilledAuditForms = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const templates = await Audit.find({ userId });

    res.status(200).json(templates);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch audit forms", error: error.message });
  }
});

// Fetch a specific version of an audit form filled by a user
export const getAuditFormVersionById = asyncHandler(async (req, res) => {
  try {
    const { id, version } = req.params;
    const template = await Audit.findOne({ _id: id, version: version });

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
