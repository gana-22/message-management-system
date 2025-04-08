export interface CacheMessage<T = unknown> {
  key: string;
  value: T;
}
