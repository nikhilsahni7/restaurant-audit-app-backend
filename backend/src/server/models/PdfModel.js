import mongoose from 'mongoose';

const auditVersionSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    formId: {
        type: String,
        required: true
    },
    versionNumber: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    pdfPath: {
        type: String,
        required: true
    }
});

const AuditVersion = mongoose.model('AuditVersion', auditVersionSchema);

export default AuditVersion;
