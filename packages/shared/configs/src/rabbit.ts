import { IRabbitConfig } from "@shared/interfaces";

import { coreConfig } from "./core";
import { tryGetEnv } from "./get-env";

export const getRabbitConfig = (): IRabbitConfig => ({
  user: tryGetEnv("RABBITMQ_USERNAME"),
  password: tryGetEnv("RABBITMQ_PASSWORD"),
  host: tryGetEnv("RABBITMQ_HOST"),
  port: +tryGetEnv("RABBITMQ_PORT"),
  vhost: tryGetEnv("RABBITMQ_VHOST", ""),
  queueType: tryGetEnv("RABBITMQ_QUEUE_TYPE", ""),
  queues: {
    TEST: `${coreConfig.env}_test`,
    TEST2: `${coreConfig.env}_test2`,
  },
  queuesTTL: {
    TEST: 5 * 60 * 1000, // 5 minutes
    TEST2: 10 * 60 * 1000, // 10 minutes
  },
  // https://www.rabbitmq.com/heartbeats.html
  healthCheckSeconds: 5, // [5;20] are optimal, <5 will likely to cause false positives
  connectionTimeoutMs: 1000, // for how long the amqplib will be waiting for connection establishment before timing out
  dlx: {
    exchangeName: "my.dlx",
    queueName: "dead-letter-queue",
    routingKey: "#", // Using '#' for routing key to accept all messages
  },
});
