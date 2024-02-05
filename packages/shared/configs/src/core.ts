import { ENVIRONMENT, ICoreConfig, APP_NAME } from "@shared/interfaces";

import { tryGetEnv } from "./get-env";

const getNodeEnvValue = (): ENVIRONMENT => {
  const stringValue = tryGetEnv("NODE_ENV", ENVIRONMENT.LOCAL);
  if (!Object.values(ENVIRONMENT).includes(stringValue as ENVIRONMENT)) {
    throw new Error(`[getNodeEnvValue] Invalid environment: ${stringValue}`);
  }

  return stringValue as ENVIRONMENT;
};

const getAppNameValue = (): APP_NAME => {
  const stringValue = tryGetEnv("APP_NAME");
  if (!Object.values(APP_NAME).includes(stringValue as APP_NAME)) {
    throw new Error(`[getServerNameValue Invalid server name: ${stringValue}`);
  }

  return stringValue as APP_NAME;
};

export const coreConfig: ICoreConfig = {
  port: +tryGetEnv("PORT"),
  env: getNodeEnvValue(),
  appName: getAppNameValue(),
  allowedNodeIp: tryGetEnv("ALLOWED_NODE_IP", "127.0.0.1"),
};

console.log("[coreConfig]", {
  port: coreConfig.port,
  env: coreConfig.env,
  appName: coreConfig.appName,
  nodeJS: process.version,
  allowedNodeIp: coreConfig.allowedNodeIp,
});
