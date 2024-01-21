import { Request, Response } from "express";

export class UserController {
  public static getUsers(req: Request, res: Response) {
    res.status(200).send({ text: "user" });
  }
}
