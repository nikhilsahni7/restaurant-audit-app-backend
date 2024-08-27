import PDFDocument from "pdfkit";
import fs from "fs";
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
      restaurantName: template.restaurantName, // Use template's restaurant name
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
      version: (template.version || 0) + 1, // Increment version based on previous template
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
    res
      .status(500)
      .json({ message: "Failed to create audit form", error: error.message });
  }
});

const generateAuditPdf = async (auditForm) => {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const pdfName = `Audit_Form_${auditForm._id}_v${auditForm.version}.pdf`;
  const pdfPath = path.join("../pdf", "..", "pdfs", pdfName);

  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  doc.pipe(fs.createWriteStream(pdfPath));

  generateCoverPage(doc, auditForm);
  doc.addPage();
  generateCompanyInfoPage(doc, auditForm);
  doc.addPage();
  generateAuditChecklist(doc, auditForm);
  doc.addPage();
  generateFinalPage(doc);

  doc.end();
  return pdfPath;
};

const generateCoverPage = (doc, auditForm) => {
  // HACCP diagram
  doc.image(
    "/home/nikhil-sahni/Coding/restaurant-audit-backend/backend/src/server/hacpp.png",
    50,
    50,
    { width: 500 }
  );

  // Quantus logo (larger version)
  doc.image(
    "/home/nikhil-sahni/Coding/restaurant-audit-backend/backend/src/server/quantus.png",
    50,
    250,
    { width: 500 }
  );

  doc.fontSize(24).text("HACCP RE-CERTIFICATION", 50, 400, { align: "center" });
  doc.fontSize(12).text("CAC/RCP 1-1969, Rev. 4-2003", { align: "center" });
  doc.text("Doc No: QMSPL_F/9.2_F13", { align: "center" });
  doc.moveDown();
  doc.fontSize(18).text("CONFIDENTIAL", { align: "center" });
  doc.moveDown(2);
  doc.fontSize(14).text(`ISSUED TO: ${auditForm.nameOfCompany}`, 50, 650);

  // Quantus logo (smaller version)
  doc.image(
    "/home/nikhil-sahni/Coding/restaurant-audit-backend/backend/src/server/quantus-smaller.png",
    250,
    700,
    { width: 100 }
  );
};

const generateCompanyInfoPage = (doc, auditForm) => {
  const tableTop = 50;
  const tableLeft = 50;
  const columnWidth = 250;
  const rowHeight = 25;

  const drawTableRow = (text, value, rowIndex, isGray = false) => {
    const y = tableTop + rowIndex * rowHeight;
    if (isGray) {
      doc
        .fillColor("#e0e0e0")
        .rect(tableLeft, y, columnWidth * 2, rowHeight)
        .fill();
    }
    doc.fillColor("black").stroke();
    doc.rect(tableLeft, y, columnWidth, rowHeight).stroke();
    doc.rect(tableLeft + columnWidth, y, columnWidth, rowHeight).stroke();
    doc
      .fontSize(10)
      .text(text, tableLeft + 5, y + 7, { width: columnWidth - 10 });
    doc.text(value, tableLeft + columnWidth + 5, y + 7, {
      width: columnWidth - 10,
    });
  };

  drawTableRow("Name of Company", auditForm.nameOfCompany, 0, true);
  drawTableRow("FSSAI License No.", auditForm.fssaiLicenseNo, 1);
  drawTableRow(
    "Company Representative",
    auditForm.companyRepresentatives.join(", "),
    2,
    true
  );
  drawTableRow("Site Address", auditForm.siteAddress, 3);
  drawTableRow("State", auditForm.state, 4, true);
  drawTableRow("Pin Code", auditForm.pinCode, 5);
  drawTableRow("Phone No.:", auditForm.phoneNo, 6, true);
  drawTableRow("Website:", auditForm.website, 7);
  drawTableRow("E mail:", auditForm.email, 8, true);
  drawTableRow("Audit Team:", auditForm.auditTeam.join(", "), 9);
  drawTableRow("Audit Type:", auditForm.auditType, 10, true);
  drawTableRow(
    "Date of Audit:",
    new Date(auditForm.dateOfAudit).toLocaleDateString(),
    11
  );
  drawTableRow("Audit Criteria:", auditForm.auditCriteria, 12, true);
  drawTableRow("Type of Audit:", auditForm.typeOfAudit, 13);
  drawTableRow("Scope", auditForm.scope, 14, true);
  drawTableRow(
    "Manpower",
    `Male: ${auditForm.manpower.male}, Female: ${auditForm.manpower.female}`,
    15
  );

  // Add checkbox for Annual audit
  doc.rect(tableLeft, tableTop + 16 * rowHeight, 15, 15).stroke();
  if (auditForm.typeOfAudit === "Annual audit") {
    doc.fillAndStroke("black");
    doc
      .fillColor("black")
      .text("✓", tableLeft + 2, tableTop + 16 * rowHeight + 2);
  }
  doc.text("Annual audit", tableLeft + 20, tableTop + 16 * rowHeight + 3);
};

const generateAuditChecklist = (doc, auditForm) => {
  auditForm.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) doc.addPage();

    doc.fontSize(14).text(section.sectionTitle, { underline: true });
    doc.moveDown();

    const tableTop = doc.y;
    const tableLeft = 50;
    const columnWidths = [250, 100, 200];
    const rowHeight = 30;

    // Table header
    doc.rect(tableLeft, tableTop, sum(columnWidths), rowHeight).stroke();
    doc
      .fontSize(10)
      .text("Requirements & Guidelines", tableLeft + 5, tableTop + 5, {
        width: columnWidths[0] - 10,
      });
    doc.text("Compliance", tableLeft + columnWidths[0] + 5, tableTop + 5, {
      width: columnWidths[1] - 10,
    });
    doc.text(
      "Evidence & Comments",
      tableLeft + columnWidths[0] + columnWidths[1] + 5,
      tableTop + 5,
      { width: columnWidths[2] - 10 }
    );

    let currentY = tableTop + rowHeight;

    section.questions.forEach((question, index) => {
      const rowHeight = Math.max(
        calculateTextHeight(doc, question.question, columnWidths[0]),
        calculateTextHeight(doc, question.evidenceAndComments, columnWidths[2])
      );

      // Question
      doc.rect(tableLeft, currentY, columnWidths[0], rowHeight).stroke();
      doc.text(question.question, tableLeft + 5, currentY + 5, {
        width: columnWidths[0] - 10,
      });

      // Compliance
      doc
        .rect(tableLeft + columnWidths[0], currentY, columnWidths[1], rowHeight)
        .stroke();
      doc.text(
        question.compliance,
        tableLeft + columnWidths[0] + 5,
        currentY + 5,
        { width: columnWidths[1] - 10 }
      );

      // Evidence & Comments
      doc
        .rect(
          tableLeft + columnWidths[0] + columnWidths[1],
          currentY,
          columnWidths[2],
          rowHeight
        )
        .stroke();
      doc.text(
        question.evidenceAndComments,
        tableLeft + columnWidths[0] + columnWidths[1] + 5,
        currentY + 5,
        { width: columnWidths[2] - 10 }
      );

      currentY += rowHeight;

      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }
    });
  });
};

const generateFinalPage = (doc) => {
  // "END" text at the top
  doc
    .fontSize(12)
    .text("***************END***************", 50, 50, { align: "center" });

  // GO GREEN logo
  doc.image(
    "/home/nikhil-sahni/Coding/restaurant-audit-backend/backend/src/server/gogreen.png",
    250,
    100,
    { width: 100 }
  );

  // Green text
  doc
    .fillColor("green")
    .fontSize(10)
    .text(
      "Don't Print this Quotation unless required!! Save paper!! Save trees!! Go Green!",
      50,
      220,
      { align: "center" }
    );
  doc
    .fillColor("green")
    .text("Save the Country!!!", 50, 235, { align: "center" });

  // Disclaimer
  doc
    .fillColor("black")
    .fontSize(10)
    .text("Disclaimer", 50, 270, { align: "center", underline: true });
  doc
    .fontSize(8)
    .text(
      "This report is made solely on the basis of your instructions and/or information and materials supplied by you. It is not intended to be a recommendation for any particular course of action. Quantus does not accept a duty of care or any other responsibility to any person other than the Client in respect of this report and only to the extent agreed in the relevant contract.",
      50,
      290,
      { align: "justify", width: 500 }
    );

  // Additional disclaimer text
  doc
    .fontSize(8)
    .text(
      "accepts liability to the Client insofar as is expressly contained in the terms and conditions governing Quantus' provision of services to you. Quantus makes no warranties or representations either express or implied with respect to the functionality or use of this report. As we aim to ensure that the facts we use in our reports are correct, we review on a diligent and careful basis and we do not accept any liability to you for any loss arising out of or in connection with this report, in contract, tort, by statute or otherwise, except in the event of our gross negligence or willful misconduct.",
      50,
      350,
      { align: "justify", width: 500 }
    );

  // Quantus logo at the bottom
  doc.image(
    "/home/nikhil-sahni/Coding/restaurant-audit-backend/backend/src/server/quantus.png",
    50,
    700,
    { width: 200 }
  );
};

const calculateTextHeight = (doc, text, width) => {
  const lines = doc.widthOfString(text, { width }) / width;
  return Math.max(lines * 14, 30);
};

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

export default generateAuditPdf;
// Fetch all audit forms filled by a specific user
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
