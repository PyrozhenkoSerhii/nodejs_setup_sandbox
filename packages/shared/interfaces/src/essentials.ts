export interface IServiceHealthResponse {
  isHealthy: boolean;
  extra?: any;
}

export interface IEssentialService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
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
