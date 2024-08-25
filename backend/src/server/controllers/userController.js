import Audit from '../models/TaskModel.js';
import asyncHandler from 'express-async-handler'; // For handling async errors

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

// Fill out or create a new audit form
export const fillOrCreateAuditForm = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params; // Template ID to fetch default values
        const { userId, dateOfAudit, auditType, auditCriteria, typeOfAudit, scope, manpower, sections } = req.body;

        // Find the existing audit template
        const template = await Audit.findById(id);
        if (!template) {
            return res.status(404).json({ message: 'Audit template not found' });
        }

        // Create a new audit form entry
        const newAuditForm = new Audit({
            restaurantName: template.restaurantName,
            nameOfCompany: template.nameOfCompany,
            fssaiLicenseNo: template.fssaiLicenseNo,
            companyRepresentatives: template.companyRepresentatives,
            siteAddress: template.siteAddress,
            state: template.state,
            pinCode: template.pinCode,
            phoneNo: template.phoneNo,
            email: template.email,
            website: template.website,
            auditTeam: template.auditTeam,
            dateOfAudit,
            auditType,
            auditCriteria,
            typeOfAudit,
            scope,
            manpower,
            sections,
            status: 'FILLED',
            version: (template.version || 0) + 1, // Increment version based on previous template
            userId
        });

        const savedAuditForm = await newAuditForm.save();

        res.status(201).json({
            message: 'Audit form created successfully',
            auditForm: savedAuditForm
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create audit form', error: error.message });
    }
});

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
