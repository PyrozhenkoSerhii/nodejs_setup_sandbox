import { tryGetEnv } from "./get-env";

enum ENVIRONMENT {
  LOCAL="local",
  DEV="dev",
  PROD="prod"
}

const isValidEnvironment = (value: string): boolean => {
  return Object.values(ENVIRONMENT).includes(value as ENVIRONMENT);
};

export const coreConfig = {
  port: +tryGetEnv("PORT"),
  env: tryGetEnv("NODE_ENV", ENVIRONMENT.LOCAL),
  serverName: tryGetEnv("SERVER_NAME"),
};

console.log("[coreConfig]", {
  port: coreConfig.port,
  env: coreConfig.env,
  serverName: coreConfig.serverName,
  nodeJS: process.version,
});

if (!isValidEnvironment(coreConfig.env)) {
  throw new Error(`Invalid environment: ${coreConfig.env}`);
}
