import express from 'express';
import { createAuditTemplate, getAuditTemplates, getAuditTemplateById, updateAuditTemplate, deleteAuditTemplate } from '../controllers/auditController.js';

const router = express.Router();

// Route to create a new audit template
router.post('/audit-template', createAuditTemplate);

// Route to get all audit templates
router.get('/audit-templates', getAuditTemplates);

// Route to get a specific audit template by ID
router.get('/audit-template/:id', getAuditTemplateById);

// Route to update an audit template by ID (only restaurantName and sections)
router.put('/audit-template/:id', updateAuditTemplate);

// Route to delete an audit template by ID
router.delete('/audit-template/:id', deleteAuditTemplate);

export default router;
