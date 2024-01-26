export interface IServiceHealthResponse {
  isHealthy: boolean;
  extra?: any;
}

export interface IEssentialService {
  name: string;
  connect(): Promise<void>;
  health(): Promise<IServiceHealthResponse>;
}

export interface IServiceHealthSummaryItem {
  serviceName: string;
  isHealthy: boolean;
  message?: string;
}

export interface IHealthSummary {
  unhealthyCount: number;
  details: IServiceHealthSummaryItem[];
}
