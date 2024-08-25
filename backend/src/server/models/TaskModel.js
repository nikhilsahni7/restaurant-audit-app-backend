import { Schema, model } from "mongoose";

const questionSchema = new Schema({
    question: String,
    compliance: {
        type: String,
        enum: ['Y', 'N', 'NI', 'N/A'], // Compliance options
    },
    evidenceAndComments: String,
    image:String
}, { _id: false });

const sectionSchema = new Schema({
    sectionTitle: String,
    questions: [questionSchema]
}, { _id: false });

const auditSchema = new Schema({
    userId:String,
    restaurantName:String,
    nameOfCompany: String,
    fssaiLicenseNo: String,
    companyRepresentatives: [String], // For multiple representatives
    siteAddress: String,
    state: String,
    pinCode: String,
    phoneNo: String,
    email: String,
    website: String,
    auditTeam: [String], // For multiple auditors
    dateOfAudit: Date,
    auditType: String,
    auditCriteria: String,
    typeOfAudit: String,
    scope: String,
    manpower: {
        male: Number,
        female: Number
    },
    sections: [sectionSchema],
    status:{
        type:String,
        enum:["FILLED","NOT FILLEd"],
    },
    version:Number
}, { timestamps: true });

export default model("Audit", auditSchema);

