export interface KafkaMessage<T> {
  topic: string;
  key?: string;
  data: T;
}

export interface KafkaConsumerConfig<T = unknown> {
  topic: string;
  groupId: string;
  fromBeginning?: boolean;
  maxRetries: number;
  retryDelay: number;
  processor: (message: T) => Promise<void>;
}
