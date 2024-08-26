import express from 'express';
import {
    getAuditTemplateById,
    fillOrCreateAuditForm,
    getUserFilledAuditForms,
    getAuditFormVersionById,
    deleteAuditForm,
    userRegistration,
    userLogin
} from '../controllers/userController.js';

const router = express.Router();

router.post("/register",userRegistration);
router.post("/login",userLogin);
// Route to fill out or create a new audit form
router.post('/audit-form/:id', fillOrCreateAuditForm);

// Route to get an audit template by ID
router.get('/audit-template/:id', getAuditTemplateById);
// Route to get all audit forms filled by a specific user
router.get('/user-audit-forms/:userId', getUserFilledAuditForms);
// Route to get a specific version of an audit form
router.get('/audit-form/:id/version/:version', getAuditFormVersionById);

// Route to delete an audit form
router.delete('/audit-form/:id', deleteAuditForm);

export default router;
