import express, { json } from "express";
import connectDb from "./config/dbconnection.js";
import cors from "cors";
import uploadKeRoutes from './routes/uploadRoutes.js';
import {FRONTEND_URL} from "./constants.js"

connectDb();
const app = express();
const port = process.env.PORT || 3002;

app.use(json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: `${FRONTEND_URL}`,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("/api/image",uploadKeRoutes);
app.get("/",(req,res)=>{
  res.send("server is working");
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});