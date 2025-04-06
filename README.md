# Message Management System

A RESTful API for message management built with NestJS, MongoDB, Kafka, and Elasticsearch.

## Architecture

This project follows Domain-Driven Design (DDD) and Event-Driven Architecture (EDA) principles:

- **Domain**: Focused on messages and conversations as the core domain entities
- **Event-Driven**: Uses Kafka for message events, decoupling the message creation from indexing
- **SOLID Principles**: Adhered to SOLID principle for maintainable and extensible design

### Key Components

1. **MongoDB**: Primary data store.
2. **Kafka**: Message broker.
3. **Elasticsearch**: Search functionality.
4. **NestJS**: Framework for building RESTful APIs.

### Data Flow

1. Client makes a POST request to create a message
2. Message is stored in MongoDB
3. Message creation event is published to Kafka
4. Kafka consumer processes the event and indexes the message in Elasticsearch
5. Clients can query messages by conversation or search for specific content
6. Query results will be retrieved from Redis if available; otherwise, they will be stored in Redis.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) (Docker Engine 28+ and Docker Compose v2)
- [Node.js](https://nodejs.org/) (v22+)
- [npm](https://www.npmjs.com/) (v10+)

## Getting Started

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/gana-22/message-management-system.git
   cd message-management-system
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running with Docker

The easiest way to run the application is with Docker Compose:

```bash
# Rename .env.example to .env.local
mv .env.example .env.local

# Build and start all services by using default .env file
docker compose up -d

# Build and start all services by specifying environment
docker compose --env-file .env.local up -d

# To rebuild after making changes
docker compose --env-file .env.local up -d --build
```

This will start:
- MongoDB on port 27017
- Zookeeper on port 2181
- Kafka on port 9092
- Elasticsearch on port 9200
- The NestJS API on port 3000

### Running Without Docker

If you want to run the application without Docker, you'll need to:

1. Install and start MongoDB, Kafka, and Elasticsearch locally.
2. Configure environment variables in a `.env` file based on the `.env.example`:
   ```
   # Application Settings
    PORT=3000
    NODE_ENV=local

    # MongoDB Connection
    MONGODB_URI=mongodb://mongodb:27017/message-db

    # Kafka Configuration
    KAFKA_BROKERS=kafka:9092
    KAFKA_TOPIC=messages
    KAFKA_CFG_PROCESS_ROLES=broker,controller
    KAFKA_CFG_NODE_ID=1
    KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
    KAFKA_CFG_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093
    KAFKA_CFG_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092,CONTROLLER://localhost:9093

    # Elasticsearch Configuration
    ELASTICSEARCH_NODE=http://elasticsearch:9200
    ELASTICSEARCH_INDEX=messages
    ELASTICSEARCH_SHARD=1
    ELASTICSEARCH_REPLICA=0

    # Redis Configuration
    REDIS_HOST=redis
    REDIS_PORT=6379
    REDIS_CACHE_TTL=60

    # Logging
    LOG_LEVEL=info                                                                                      
   ```

3. Start the application:
   ```bash
   npm run start:dev
   ```

## API Endpoints

Note: Added postman collection in docs folder

### Create a new message

```
POST /api/messages
```

Request body:
```json
{
  "conversationId": "string",
  "senderId": "string",
  "content": "string",
  "metadata": {}
}
```

### Get messages for a conversation

```
GET /api/conversations/:conversationId/messages
```

Query parameters:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `sortBy` (optional): Field to sort by (default: timestamp)
- `sortOrder` (optional): Sort order, 'asc' or 'desc' (default: desc)

### Search messages in a conversation

```
GET /api/conversations/:conversationId/messages/search?q=term
```

Query parameters:
- `q`: Search term
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

## Testing

### Running Unit Tests

```bash
# Run unit tests
npm run test

# Run tests with coverage
npm run test:cov
```

### Running E2E Tests

```bash
# Make sure the application and dependencies are running first (e.g., via docker compose)
# This been disabled for time-being as the tests are failing
# npm run test:e2e
```

## Performance Considerations

- **MongoDB Indexing**: Indexes are created on frequently queried fields (conversationId, content and timestamp)
- **Elasticsearch Mappings**: Optimized for full-text search
- **Kafka Partitioning**: Messages are partitioned by conversationId for parallel processing
- **Pagination**: Both get and search messages support pagination to limit response size

## Security

- Input validation using class-validator
- Data sanitization
- Environment variables for sensitive configuration

## Future Improvements

- Add authentication and authorization

## Troubleshooting

### Common Issues

1. **Kafka Connection Issues**:
   - Check if Kafka and Zookeeper are running
   - Verify broker addresses and port configurations

2. **Elasticsearch Mapping Errors**:
   - Delete and recreate the index
   - Check if Elasticsearch is running on the configured port

3. **MongoDB Connection Issues**:
   - Verify MongoDB connection string
   - Check if MongoDB service is running

### Logs

Docker logs can be accessed with:

```bash
# View logs for a specific service
docker compose logs -f api
docker compose logs -f mongodb
docker compose logs -f kafka
docker compose logs -f elasticsearch
```
