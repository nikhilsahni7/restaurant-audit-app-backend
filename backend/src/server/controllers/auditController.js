import Audit from '../models/TaskModel.js';
import asyncHandler from "express-async-handler"

export const createAuditTemplate = asyncHandler(async (req, res) => {
    try {
        const { restaurantName, sections } = req.body;

        const newAuditTemplate = new Audit({
            restaurantName,
            nameOfCompany: "", // Default value
            fssaiLicenseNo: "", // Default value
            companyRepresentatives: [], // Default value
            siteAddress: "", // Default value
            state: "", // Default value
            pinCode: "", // Default value
            phoneNo: "", // Default value
            email: "", // Default value
            website: "", // Default value
            auditTeam: [], // Default value
            dateOfAudit: null, // To be filled by the user
            auditType: "", // Default value
            auditCriteria: "", // Default value
            typeOfAudit: "", // Default value
            scope: "", // Default value
            manpower: {
                male: 0, // Default value
                female: 0 // Default value
            },
            sections,
            status: 'NOT FILLED',
            version: 0,
            userId: "" // To be filled by the user
        });

        const savedAuditTemplate = await newAuditTemplate.save();

        res.status(201).json({
            message: 'Audit template created successfully',
            auditTemplate: savedAuditTemplate
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create audit template', error: error.message });
    }
});

// Fetch all audit templates (for admin to review)
export const getAuditTemplates = asyncHandler(async (req, res) => {
    try {
        const templates = await Audit.find({ status: 'NOT FILLED' });
        res.status(200).json(templates);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch audit templates', error: error.message });
    }
});

// Fetch a specific audit template by ID
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

// Update an existing audit template (if needed)
export const updateAuditTemplate = asyncHandler(async (req, res) => {
    try {
        const { restaurantName, sections } = req.body;

        const updatedTemplate = await Audit.findByIdAndUpdate(
            req.params.id,
            { restaurantName, sections },
            { new: true }
        );

        if (!updatedTemplate) {
            return res.status(404).json({ message: 'Audit template not found' });
        }

        res.status(200).json({
            message: 'Audit template updated successfully',
            auditTemplate: updatedTemplate
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update audit template', error: error.message });
    }
});

// Delete an audit template
export const deleteAuditTemplate = asyncHandler(async (req, res) => {
    try {
        const deletedTemplate = await Audit.findByIdAndDelete(req.params.id);

        if (!deletedTemplate) {
            return res.status(404).json({ message: 'Audit template not found' });
        }

        res.status(200).json({ message: 'Audit template deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete audit template', error: error.message });
    }
});
