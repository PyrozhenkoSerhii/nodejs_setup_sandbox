export enum ESSENTIAL_SERVICE_EVENT {
  HEALTH_CHANGE="HEALTH_CHANGE"
}

export enum ESSENTIAL_SERVICE_HEALTH {
  NOT_INITIALIZED="NOT_INITIALIZED", // default state
  GOOD="GOOD", // everything is connected and working
  BAD="BAD", // lost the connection, trying to reconnect
  CRITICAL="CRITICAL", // gave up on reconnection, need to gracefully shutdown everything
  STOPPED="STOPPED" // manually stopped the service
}

export interface IEssentialService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  on(event: ESSENTIAL_SERVICE_EVENT.HEALTH_CHANGE, listener: (health: ESSENTIAL_SERVICE_HEALTH) => void): this;
  /**
   * The method is used when the service is unreachable to provide the tasks for execution
   * They should be executed as soon as the service is healthy again
   */
  onFailure(...task: any): void;
  getPublicInstance(): any;
}
