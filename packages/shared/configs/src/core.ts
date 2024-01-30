import { ENVIRONMENT, ICoreConfig } from "@shared/interfaces";

import { tryGetEnv } from "./get-env";

const isValidEnvironment = (value: string): boolean => {
  return Object.values(ENVIRONMENT).includes(value as ENVIRONMENT);
};

const getNodeEnvValue = (): ENVIRONMENT => {
  const stringValue = tryGetEnv("NODE_ENV", ENVIRONMENT.LOCAL);
  if (!isValidEnvironment(stringValue)) {
    throw new Error(`Invalid environment: ${stringValue}`);
  }

  return stringValue as ENVIRONMENT;
};

export const coreConfig: ICoreConfig = {
  port: +tryGetEnv("PORT"),
  env: getNodeEnvValue(),
  serverName: tryGetEnv("SERVER_NAME"),
  allowedNodeIp: tryGetEnv("ALLOWED_NODE_IP", "127.0.0.1"),
};

console.log("[coreConfig]", {
  port: coreConfig.port,
  env: coreConfig.env,
  serverName: coreConfig.serverName,
  nodeJS: process.version,
  allowedNodeIp: coreConfig.allowedNodeIp,
});
