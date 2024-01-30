import { IRabbitConfig } from "@shared/interfaces";

import { coreConfig } from "./core";
import { tryGetEnv } from "./get-env";

export const getRabbitConfig = (): IRabbitConfig => ({
  user: tryGetEnv("RABBITMQ_USERNAME"),
  password: tryGetEnv("RABBITMQ_PASSWORD"),
  host: tryGetEnv("RABBITMQ_HOST"),
  port: tryGetEnv("RABBITMQ_PORT"),
  vhost: tryGetEnv("RABBITMQ_VHOST", ""),
  queueType: tryGetEnv("RABBITMQ_QUEUE_TYPE", ""),
  queues: {
    test: `test_${coreConfig.env}`,
  },
});
