import { Router } from "express";

import { UserController } from "./controller/users";

export const router = Router();

router.use("/user", Router()
  .get("/", UserController.getUsers));
