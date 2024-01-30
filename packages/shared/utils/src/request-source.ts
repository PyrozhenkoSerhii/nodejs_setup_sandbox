import { Request, Response, NextFunction } from "express";

import { coreConfig } from "@shared/configs";
import { Logger } from "@shared/utils";

const IP_V6_PREFIX = "::ffff:";

export const checkRequestSource = (req: Request, res: Response, next: NextFunction) => {
  const clientIp = req.socket.remoteAddress?.substring(IP_V6_PREFIX.length);
  if (!clientIp) return res.status(401);

  Logger.log(`[checkRequestSource] Initial client IP: ${req.socket.remoteAddress}, actual IP: ${clientIp}, allowNodeIp: ${coreConfig.allowedNodeIp}`);

  if (coreConfig.allowedNodeIp.includes(clientIp)) {
    next();
  } else {
    res.sendStatus(401);
  }
};
