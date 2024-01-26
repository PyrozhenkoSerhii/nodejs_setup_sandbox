export interface IEssentialService {
  name: string;
  connect(): Promise<void>;
  health(): Promise<boolean>;
}

export interface IServiceHealth {
  serviceName: string;
  isHealthy: boolean;
  message?: string;
}

export interface IHealthSummary {
  unhealthyCount: number;
  details: IServiceHealth[];
}
