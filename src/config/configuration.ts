export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/message-db',
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    messageTopic: process.env.KAFKA_MESSAGE_TOPIC || 'messages',
    cacheTopic: process.env.KAFKA_CACHE_TOPIC || 'cache',
  },
  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    index: process.env.ELASTICSEARCH_INDEX || 'messages',
    shards: parseInt(process.env.ELASTICSEARCH_SHARD || '1'),
    replicas: parseInt(process.env.ELASTICSEARCH_REPLICA || '0'),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    ttl: parseInt(process.env.REDIS_CACHE_TTL || '60', 10),
  },
});
