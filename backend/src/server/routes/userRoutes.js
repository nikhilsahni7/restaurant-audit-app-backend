import express from "express";
import {
  getAuditTemplateById,
  fillOrCreateAuditForm,
  getUserFilledAuditForms,
  getAuditFormVersionById,
  deleteAuditForm,
  userRegistration,
  userLogin,
  updateAuditForm,
  getPdfPathForForm,
  getUserDetails,
} from "../controllers/userController.js";

const router = express.Router();

router.post("/register", userRegistration); // register user
router.post("/login", userLogin); // login user
router.get("/user-details/:userId", getUserDetails);
// Route to fill out or create a new audit form
router.get("/audit-form/:formId", getPdfPathForForm);
router.post("/audit-form/", fillOrCreateAuditForm); // pdf generate
router.put("/audit-forms/:id", updateAuditForm); // edit pdf form
// Route to get an audit template by ID
router.get("/audit-template/:id", getAuditTemplateById);
// Route to get all audit forms filled by a specific user
router.get("/user-audit-forms/:userId", getUserFilledAuditForms);
// Route to get a specific version of an audit form
router.get("/audit-form/:id/version/:version", getAuditFormVersionById);

// Route to delete an audit form
router.delete("/audit-form/:id", deleteAuditForm);

export default router;
