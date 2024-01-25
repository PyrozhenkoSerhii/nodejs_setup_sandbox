import "../../aliases";

import express from "express";

import { a } from "@shared/configs";

console.log(a);

const app = express();

app.listen(process.env.PORT, () => {
  console.log("express is running");
});
