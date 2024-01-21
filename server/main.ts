// import dotenv from "dotenv"; // lib for .env
import express from "express";

import { router } from "./routes";
import { connectToMongo } from "./services/mongoose";

// dotenv.config({ path: "./environment/.env" });

const app = express();

app.use("/api", router);

console.log(process.env.PORT);
console.log(process.env.NODE_ENV);

app.listen(process.env.PORT, () => {
  console.log("express is running");
  connectToMongo();
});
