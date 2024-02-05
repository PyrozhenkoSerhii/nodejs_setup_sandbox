import { ESSENTIAL_SERVICE_NAME, APP_NAME } from "@shared/interfaces";

/**
 * The config that is responsible for shutting down the app in critical states
 * Every Essential Service should have a max ttl after which the app
 * should stop gracefully in we weren't able to reconnect during that time
 */
export const livenessConfig = {
  default: {
    [APP_NAME.SERVER]: {
      [ESSENTIAL_SERVICE_NAME.MONGODB]: {
        maxReconnectMs: 60 * 1000,
      },
      [ESSENTIAL_SERVICE_NAME.RABBITMQ]: {
        maxReconnectMs: 60 * 1000,
      },
    },
  },
};
