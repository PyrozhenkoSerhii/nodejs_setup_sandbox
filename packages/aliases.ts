/**
 * This file is used to enable aliases like
 * import { something } from "@shared/something";
 * in the runtime.
 *
 * Without it you'll get an error like:
 * Error: Cannot find module '@shared/something'
 * event if Typescript knows about it and doesn't show any errors
 */

import path from "path";

const moduleAlias = require("module-alias");

const sharedPath = process.env.NODE_ENV === "local"
  ? path.join(__dirname, "./shared")
  /**
   * For production we need to use /dist folder that contains built assets.
   * When in production, we run the service from its /dist
   * the __dirname will change because we'll be inside
   * Thus we need to change ./shared -> ../../shared/dist
   */
  : path.join(__dirname, "../../shared/dist");

moduleAlias.addAlias("@shared", sharedPath);
