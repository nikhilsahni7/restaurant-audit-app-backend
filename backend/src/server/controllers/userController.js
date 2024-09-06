import { PDFDocument, PDFTextField, PDFForm } from "pdf-lib";
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
      pdfPath: pdfPath,
    });
  } catch (error) {
    // Fill in the static fields

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
    existingAuditForm.nameOfCompany = nameOfCompany || existingAuditForm.nameOfCompany;
    existingAuditForm.fssaiLicenseNo = fssaiLicenseNo || existingAuditForm.fssaiLicenseNo;
    existingAuditForm.companyRepresentatives = companyRepresentatives || existingAuditForm.companyRepresentatives;
    existingAuditForm.siteAddress = siteAddress || existingAuditForm.siteAddress;
    existingAuditForm.state = state || existingAuditForm.state;
    existingAuditForm.pinCode = pinCode || existingAuditForm.pinCode;
    existingAuditForm.phoneNo = phoneNo || existingAuditForm.phoneNo;
    existingAuditForm.email = email || existingAuditForm.email;
    existingAuditForm.website = website || existingAuditForm.website;
    existingAuditForm.auditTeam = auditTeam || existingAuditForm.auditTeam;
    existingAuditForm.dateOfAudit = dateOfAudit || existingAuditForm.dateOfAudit;
    existingAuditForm.auditType = auditType || existingAuditForm.auditType;
    existingAuditForm.auditCriteria = auditCriteria || existingAuditForm.auditCriteria;
    existingAuditForm.typeOfAudit = typeOfAudit || existingAuditForm.typeOfAudit;
    existingAuditForm.scope = scope || existingAuditForm.scope;
    existingAuditForm.manpower = manpower || existingAuditForm.manpower;
    existingAuditForm.sections = sections || existingAuditForm.sections;
    existingAuditForm.version += 1;

    const updatedAuditForm = await existingAuditForm.save();

    // Generate new PDF
    const pdfPath = await generateAuditPdf(updatedAuditForm);

    // Upload PDF to S3
    const s3Url = await uploadPdfToS3(pdfPath, `Audit_Form_${updatedAuditForm._id}_v${updatedAuditForm.version}.pdf`);

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
    const templatePath = "/home/vishal-sharma/freelance/restaurant-audit-app-backend/backend/src/server/templates/template.pdf";
    const templatePdfBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templatePdfBytes);

    // Get the form from the document
    const form = pdfDoc.getForm();

    // Define field mappings
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
      fc: auditForm.manpower.female.toString()
    };

    // Fill in the text fields
    Object.entries(fieldMappings).forEach(([fieldName, value]) => {
      const field = form.getTextField(fieldName);
      if (field) {
        field.setText(value);
      }
    });

    // Handle checkboxes
    const patCheckbox = form.getCheckBox('pat');
    const aatCheckbox = form.getCheckBox('aat');
    
    if (patCheckbox) {
      auditForm.typeOfAudit === 'Pre Assessment' ? patCheckbox.check() : patCheckbox.uncheck();
    }
    if (aatCheckbox) {
      auditForm.typeOfAudit === 'Annual audit' ? aatCheckbox.check() : aatCheckbox.uncheck();
    }

    // Fill in the dynamic fields (q1, q2, q3, etc.)
    auditForm.sections.forEach((section, index) => {
      const fieldName = `q${index + 1}`;
      const field = form.getTextField(fieldName);
      if (field) {
        // For now, we'll use a sample string. In production, use the actual data:
        field.setText(section.evidenceAndComments);
        // field.setText(`Sample evidence and comments for question ${index + 1}`);
      }
    });

    /* 
    // Commented code for handling actual user data
    auditForm.sections.forEach((section, index) => {
      const fieldName = `q${index + 1}`;
      const field = form.getTextField(fieldName);
      if (field) {
        field.setText(section.evidenceAndComments);
      }
    });
    */

    form.flatten();

    // Save the PDF locally
    const pdfBytes = await pdfDoc.save();
    const pdfName = `Audit_Form_${auditForm._id}_v${auditForm.version}.pdf`;
    const pdfPath = path.join("/home/vishal-sharma/freelance/restaurant-audit-app-backend/pdfs", pdfName);
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });
    await fs.writeFile(pdfPath, pdfBytes);

    // Upload the PDF to S3
    const s3Url = await uploadPdfToS3(pdfPath, pdfName);

    // Optionally, delete the local file after uploading
    await fs.unlink(pdfPath);

    // Return the S3 URL
    return s3Url;

  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

export const getUserFilledAuditForms = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    const filledTemplates = await Audit.find({ 
      userId: userId, 
      status: "FILLED" 
    }).sort({ version: -1 }); // Sort by version in descending order

    if (!filledTemplates.length) {
      return res.status(404).json({ message: "No filled audit forms found for this user" });
    }

    res.status(200).json({
      message: "Filled audit forms retrieved successfully",
      templates: filledTemplates
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch filled audit forms", error: error.message });
  }
});

// Fetch a specific version of an audit form filled by a user
export const getAuditFormVersionById = asyncHandler(async (req, res) => {
  try {
    const { id} = req.params;
    const template = await Audit.findOne({ _id: id});

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
      .select('pdfPath versionNumber');

    if (!latestVersion) {
      return res.status(404).json({ message: "No audit version found for this form ID" });
    }

    res.status(200).json({
      message: "PDF path retrieved successfully",
      formId: formId,
      versionNumber: latestVersion.versionNumber,
      pdfPath: latestVersion.pdfPath
    });
  } catch (error) {
    res.status(500).json({ 
      message: "Failed to retrieve PDF path", 
      error: error.message 
    });
  }
});