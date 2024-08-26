import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import Audit from '../models/TaskModel.js';
import AuditVersion from '../models/PdfModel.js';
import asyncHandler from 'express-async-handler';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/UserModel.js'; 
import dotenv from 'dotenv'

dotenv.config();

export const userRegistration = asyncHandler(async (req, res) => {
    try{

        const { name, email, phoneNumber, password } = req.body;
    
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
    
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
    
        // Create new user
        const user = new User({
            name,
            email,
            phoneNumber,
            password: hashedPassword
        });
    
        const savedUser = await user.save();
    
        // Create JWT token
        const token = jwt.sign({ userId: savedUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
        res.status(201).json({
            message: 'User registered successfully',
            token,
            userId: savedUser._id,
            name: savedUser.name,
            email: savedUser.email,
            phoneNumber: savedUser.phoneNumber
        });
    }catch(err){
        return res.status(500).json({message:`Internal Server Error ${err}`})
    }
});

export const userLogin = asyncHandler(async (req, res) => {
    try{
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
        return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Create JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
        message: 'User logged in successfully',
        token,
        userId: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber
    });
}catch(err){
    return res.status(500).json({message:`Internal Server Error ${err}`})
}
    
});

// Fetch an audit template by ID (for users to fill out)
export const getAuditTemplateById = asyncHandler(async (req, res) => {
    try {
        const template = await Audit.findById(req.params.id);
        if (!template) {
            return res.status(404).json({ message: 'Audit template not found' });
        }
        res.status(200).json(template);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch audit template', error: error.message });
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
            sections
        } = req.body;

        // Find the existing audit template
        const template = await Audit.findById(id);
        if (!template) {
            return res.status(404).json({ message: 'Audit template not found' });
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
            status: 'FILLED',
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
            pdfPath
        });

        await auditVersion.save();

        res.status(201).json({
            message: 'Audit form created successfully',
            auditForm: savedAuditForm,
            pdfPath: pdfPath
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create audit form', error: error.message });
    }
});

const generateAuditPdf = async (auditForm) => {

    const doc = new PDFDocument({ margin: 50 });
    const pdfName = `Audit_Form_${auditForm._id}_v${auditForm.version}.pdf`;
    const pdfPath = path.join("../pdf", '..', 'pdfs', pdfName);

    // Ensure the directory exists
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

    // Write PDF to file
    doc.pipe(fs.createWriteStream(pdfPath));

    // Header
    doc.fontSize(16).text('HACCP RE-CERTIFICATION', { align: 'center' });
    doc.fontSize(10).text('CAC/RCP 1-1969, Rev. 4-2003', { align: 'center' });
    doc.text('Doc No: QMSPL_F/9.2_F13', { align: 'center' });
    doc.text('CONFIDENTIAL', { align: 'center' });
    doc.moveDown();

    // Company Information
    doc.fontSize(12).text('ISSUED TO: ' + auditForm.nameOfCompany, { align: 'left' });
    doc.moveDown();

    // Create a simple table
    const tableData = [
        ['Name of Company', auditForm.nameOfCompany],
        ['FSSAI License No.', auditForm.fssaiLicenseNo],
        ['Company Representative', auditForm.companyRepresentatives.join(', ')],
        ['Site Address', auditForm.siteAddress],
        ['State', auditForm.state],
        ['Pin Code', auditForm.pinCode],
        ['Phone No.', auditForm.phoneNo],
        ['Website', auditForm.website],
        ['E mail', auditForm.email],
        ['Audit Team', auditForm.auditTeam.join(', ')],
        ['Date of Audit', new Date(auditForm.dateOfAudit).toLocaleDateString()],
        ['Audit Type', auditForm.auditType],
        ['Audit Criteria', auditForm.auditCriteria],
        ['Type of Audit', auditForm.typeOfAudit],
        ['Scope', auditForm.scope],
        ['Manpower', `Male: ${auditForm.manpower.male}, Female: ${auditForm.manpower.female}`]
    ];

    const startX = 50;
    let startY = doc.y;
    const cellPadding = 5;
    const cellWidth = 250;
    const cellHeight = 20;

    tableData.forEach((row, rowIndex) => {
        doc.font('Helvetica-Bold').fontSize(10)
           .text(row[0], startX, startY + rowIndex * cellHeight + cellPadding, { width: cellWidth });
        
        doc.font('Helvetica').fontSize(10)
           .text(row[1], startX + cellWidth, startY + rowIndex * cellHeight + cellPadding, { width: cellWidth });
        
        doc.rect(startX, startY + rowIndex * cellHeight, cellWidth, cellHeight).stroke();
        doc.rect(startX + cellWidth, startY + rowIndex * cellHeight, cellWidth, cellHeight).stroke();
    });

    doc.moveDown();

    // ... (rest of the code remains the same)

    doc.end();
    return pdfPath;
};

// Fetch all audit forms filled by a specific user
export const getUserFilledAuditForms = asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;
        const templates = await Audit.find({ userId });

        res.status(200).json(templates);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch audit forms', error: error.message });
    }
});

// Fetch a specific version of an audit form filled by a user
export const getAuditFormVersionById = asyncHandler(async (req, res) => {
    try {
        const { id, version } = req.params;
        const template = await Audit.findOne({ _id: id, version: version });

        if (!template) {
            return res.status(404).json({ message: 'Audit form version not found' });
        }

        res.status(200).json(template);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch audit form version', error: error.message });
    }
});

// Delete an audit form filled by a user
export const deleteAuditForm = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const deletedTemplate = await Audit.findByIdAndDelete(id);

        if (!deletedTemplate) {
            return res.status(404).json({ message: 'Audit form not found' });
        }

        res.status(200).json({ message: 'Audit form deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete audit form', error: error.message });
    }
});
