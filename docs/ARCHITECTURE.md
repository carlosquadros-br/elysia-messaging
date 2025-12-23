# Architecture Overview

## Overview

The `elysia-messaging` plugin follows **Clean Architecture** with clear separation between:
- **Core (Ports):** Interfaces and contracts
- **Adapters:** Concrete implementations (Redis, NATS, Kafka)
- **Plugins:** Integration with ElysiaJS lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                   ElysiaJS Application                  │
│                                                         │
│  ┌───────────────┐           ┌──────────────────────┐  │
│  │  API Server   │           │   Worker Process     │  │
│  │               │           │                      │  │
│  │  .use(        │           │  .use(               │  │
│  │   messaging() │           │   messagingConsumers │  │
│  │  )            │           │  )                   │  │
│  └───────┬───────┘           └──────────┬───────────┘  │
│          │                              │              │
└──────────┼──────────────────────────────┼──────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│              Plugin Layer (Type-Safe API)               │
│                                                         │
│  ┌────────────────────┐      ┌─────────────────────┐   │
│  │ MessagingClient    │      │ ConsumersManager    │   │
│  │                    │      │                     │   │
│  │ - publish()        │      │ - lifecycle mgmt    │   │
│  │ - validate()       │      │ - error handling    │   │
│  │ - hooks            │      │ - idempotency       │   │
│  └────────┬───────────┘      └──────────┬──────────┘   │
│           │                             │              │
└───────────┼─────────────────────────────┼──────────────┘
            │                             │
            ▼                             ▼
┌─────────────────────────────────────────────────────────┐
│           Core Layer (Ports/Contracts)                  │
│                                                         │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ TopicRegistry  │  │ MessageBus   │  │  Consumer  │  │
│  │                │  │              │  │            │  │
│  │ - schemas      │  │ - publish()  │  │ - subscribe│  │
│  │ - validation   │  │ - close()    │  │ - close()  │  │
│  └────────────────┘  └──────────────┘  └────────────┘  │
│                                                         │
│  ┌────────────────┐  ┌──────────────┐                  │
│  │ DedupeStore    │  │ Envelope     │                  │
│  │                │  │              │                  │
│  │ - has()        │  │ - eventId    │                  │
│  │ - mark()       │  │ - payload    │                  │
│  └────────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────────┘
            │                             │
            ▼                             ▼
┌─────────────────────────────────────────────────────────┐
│          Adapter Layer (Implementations)                │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────────────┐    │
│  │ Redis Streams    │  │ NATS (future)            │    │
│  │                  │  │                          │    │
│  │ - Bus            │  │ - Bus                    │    │
│  │ - Consumer       │  │ - Consumer               │    │
│  │ - DedupeStore    │  │ - DedupeStore            │    │
│  └──────────────────┘  └──────────────────────────┘    │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────────────┐    │
│  │ Kafka (future)   │  │ InMemory (testing)       │    │
│  └──────────────────┘  └──────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│           External Infrastructure                       │
│                                                         │
│  ┌──────┐  ┌──────┐  ┌────────┐  ┌──────────────┐      │
│  │Redis │  │ NATS │  │ Kafka  │  │  RabbitMQ    │      │
│  └──────┘  └──────┘  └────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Publishing (API → Worker)

```typescript
// 1. User code
await messaging.publish('video.jobs', { videoId: '123', url: '...' })

// 2. Plugin validates payload against registry schema
validateTopicPayload(registry, 'video.jobs', payload)

// 3. Plugin creates envelope with metadata
const envelope = createEnvelope('video.processing.request', jobId, payload)

// 4. Plugin calls hook (if defined)
await hooks.onPublish('video.jobs', envelope)

// 5. Plugin delegates to adapter
await bus.publish('video.jobs', envelope)

// 6. Adapter serializes and sends to broker
await redis.xadd('stream:video.jobs', '*', ...fields)
```

### Consuming (Worker processes messages)

```typescript
// 1. Plugin registers consumer on app.onStart()
await consumer.subscribe('video.jobs', wrappedHandler, options)

// 2. Adapter polls broker for messages
const messages = await redis.xreadgroup(...)

// 3. Adapter deserializes and passes to plugin
await handler(envelope)

// 4. Plugin checks idempotency (if enabled)
if (await dedupe.has(envelope.eventId)) return

// 5. Plugin validates payload
validateTopicPayload(registry, 'video.jobs', envelope.payload)

// 6. Plugin calls user handler
await userHandler(envelope)

// 7. Plugin marks as processed
await dedupe.mark(envelope.eventId)

// 8. Adapter acknowledges message
await redis.xack('stream:video.jobs', group, messageId)

// 9. On error: retry or send to DLQ
```

---

## Camadas em Detalhe

### 1. Core Layer (Ports)

**Responsabilidade:** Definir contratos e tipos.

**Arquivos:**
- `message-envelope.ts` - Estrutura da mensagem
- `message-bus.port.ts` - Interface para publicar
- `message-consumer.port.ts` - Interface para consumir
- `dedupe-store.port.ts` - Interface para idempotency
- `registry.types.ts` - Sistema de tipos do registry
- `registry.ts` - Funções para criar e validar registry

**Princípio:** Nenhuma dependência externa. Apenas TypeScript puro.

### 2. Adapter Layer

**Responsabilidade:** Implementar os ports para brokers específicos.

**Exemplo: Redis Streams**
- `RedisStreamsBus implements MessageBus`
  - Usa `XADD` para publicar
- `RedisStreamsConsumer implements MessageConsumer`
  - Usa `XREADGROUP` para consumir
  - Gerencia consumer groups
  - Implementa retry logic
- `RedisDedupeStore implements DedupeStore`
  - Usa `SET` com TTL para dedup

**Princípio:** Cada adapter é independente. Não há shared state entre adapters.

### 3. Plugin Layer

**Responsabilidade:** Integrar adapters com ElysiaJS e fornecer type-safety.

**Componentes:**
- `plugin-client.ts` - Para publishers (API servers)
  - Decorator `messaging.publish()`
  - Validação automática
  - Hooks de observabilidade
- `plugin-consumers.ts` - Para consumers (Workers)
  - Lifecycle management (onStart/onStop)
  - Wrapper de handlers (validation + idempotency + retry)
  - Error handling e DLQ

**Princípio:** Plugins são stateless. Todo estado fica nos adapters ou no Elysia context.

---

## Registry System (Type Inference)

O coração da type-safety é o `TopicRegistry<TTopics>`:

```typescript
// 1. Usuário define o registry
const myTopics = createTopicRegistry({
  'video.jobs': {
    schema: t.Object({ videoId: t.String() }),
    messageType: 'video.processing.request',
  },
})

// 2. TypeScript infere:
type TopicName = 'video.jobs'
type VideoJobsPayload = { videoId: string }

// 3. Quando usuário chama publish():
messaging.publish('video.jobs', payload)
//                               ^^^^^^^ TypeScript sabe que é { videoId: string }

// 4. Inferência acontece via generics:
type TopicPayload<TRegistry, TTopic> = 
  Static<TRegistry['topics'][TTopic]['schema']>
```

**Magia:** TypeScript mapeia topic name → schema → tipo inferido.

---

## Lifecycle Management

### API Server (Publisher-only)

```
app.listen(3000)
  ↓
Elysia onStart
  ↓
messaging plugin inicializa
  ↓
Cria decorators (messaging.publish)
  ↓
App está pronto
  ↓
[Requests chegam e publicam mensagens]
  ↓
app.stop() ou SIGINT
  ↓
Elysia onStop
  ↓
messaging.close()
  ↓
bus.close() (fecha conexões)
  ↓
App termina
```

### Worker (Consumer)

```
app.listen(3001)
  ↓
Elysia onStart
  ↓
messagingConsumers plugin inicializa
  ↓
Para cada consumer:
  - Registra no broker (cria consumer group)
  - Inicia polling loop
  ↓
[Consumers processam mensagens continuamente]
  ↓
app.stop() ou SIGINT
  ↓
Elysia onStop
  ↓
Para polling loops gracefully
  ↓
consumer.close()
  ↓
Aguarda mensagens in-flight terminarem
  ↓
App termina
```

---

## Error Handling Strategy

### Validação de Payload

```
User publica mensagem
  ↓
Plugin valida payload contra schema
  ↓
├─ Válido: continua
└─ Inválido: throw ValidationError (não publica)
```

**Princípio:** Falhar rápido no publisher. Não enviar mensagens inválidas.

### Consumer Errors

```
Consumer recebe mensagem
  ↓
Plugin valida payload
  ↓
├─ Válido: continua
└─ Inválido:
    ├─ skipInvalidPayload=true: log + ack (descarta)
    └─ skipInvalidPayload=false: throw (retry)
  ↓
Handler executa
  ↓
├─ Sucesso: ack
└─ Erro:
    ├─ attempt < maxRetries: delay + retry
    └─ attempt >= maxRetries: send to DLQ
```

**Princípio:** Retry errors transientes, DLQ para errors permanentes.

---

## Observability Hooks

Hooks permitem instrumentação sem acoplar logging/metrics ao core:

```typescript
messaging({
  registry,
  bus,
  hooks: {
    // Antes de publicar
    beforePublish?: (topic, payload) => Promise<void>
    
    // Após publicar com sucesso
    onPublish: (topic, envelope) => {
      metrics.increment('messages.published', { topic })
      tracer.trace(envelope.correlationId, { topic })
    }
    
    // Erro ao publicar
    onPublishError: (topic, envelope, error) => {
      sentry.captureException(error)
      metrics.increment('publish.errors', { topic })
    }
  }
})

messagingConsumers({
  hooks: {
    // Mensagem recebida
    onMessage: (topic, envelope) => {
      metrics.increment('messages.consumed', { topic })
    }
    
    // Handler com erro
    onError: (topic, envelope, error, attempt) => {
      logger.error('Handler failed', { topic, attempt, error })
    }
    
    // Antes de retry
    onRetry: (topic, envelope, attempt) => {
      metrics.increment('retries', { topic, attempt })
    }
    
    // Enviado para DLQ
    onDLQ: (topic, envelope, error) => {
      pagerduty.alert('Message sent to DLQ', { topic, error })
    }
    
    // Mensagem processada com sucesso
    onAck: (topic, envelope) => {
      metrics.timing('processing.duration', Date.now() - start)
    }
  }
})
```

---

## Multi-Broker Support

### Strategy 1: Single Broker (simples)

```typescript
const redisBus = new RedisStreamsBus(redis)

messaging({ registry, bus: redisBus })
```

### Strategy 2: Bus Resolver (avançado)

```typescript
messaging({
  registry,
  busResolver: (topic) => {
    if (topic.startsWith('video.')) return redisBus
    if (topic.startsWith('email.')) return natsBus
    return kafkaBus // default
  }
})
```

### Strategy 3: Multiple Plugin Instances

```typescript
const app = new Elysia()
  .use(messaging({ registry, bus: redisBus, name: 'redis' }))
  .use(messaging({ registry, bus: natsBus, name: 'nats' }))

// Usar explicitamente
app.post('/publish-redis', ({ redis }) => {
  await redis.publish('video.jobs', payload)
})

app.post('/publish-nats', ({ nats }) => {
  await nats.publish('email.jobs', payload)
})
```

---

## Idempotency

### Como Funciona

```
1. Mensagem chega com eventId="abc-123"

2. Consumer verifica:
   if (await dedupe.has('abc-123')) {
     console.log('Already processed')
     ack()
     return
   }

3. Processa mensagem

4. Marca como processado:
   await dedupe.mark('abc-123', ttl=86400) // 24h

5. ACK mensagem
```

### Implementação Redis

```typescript
class RedisDedupeStore {
  async has(eventId: string) {
    return await redis.exists(`dedupe:${eventId}`) === 1
  }
  
  async mark(eventId: string, ttl: number) {
    await redis.setex(`dedupe:${eventId}`, ttl, '1')
  }
}
```

### Quando Habilitar

✅ **Habilite idempotency se:**
- Handler não é naturalmente idempotente (ex: cobrar cartão, enviar email)
- Broker pode redelivrar mensagens (ex: falha de ack)
- Múltiplos workers processam mesmo topic

❌ **Não precisa idempotency se:**
- Handler é idempotente (ex: set no cache, upsert no DB)
- Mensagens têm exactly-once semantics (raro)
- Performance é crítica e você aceita o risco

---

## Testing Strategy

### Unit Tests

Teste cada camada isoladamente:

```typescript
// Test adapter
const bus = new RedisStreamsBus(mockRedis)
await bus.publish('test.topic', envelope)
expect(mockRedis.xadd).toHaveBeenCalled()

// Test plugin with in-memory adapter
const app = new Elysia()
  .use(messaging({ registry, bus: new InMemoryBus() }))

await request(app).post('/publish').send({ ... })
```

### Integration Tests

Teste com broker real (Docker):

```typescript
const redis = new Redis('redis://localhost:6379')
const bus = new RedisStreamsBus(redis)

await bus.publish('test.topic', envelope)

const messages = await redis.xrange('stream:test.topic', '-', '+')
expect(messages).toHaveLength(1)
```

### E2E Tests

Teste publisher + consumer juntos:

```typescript
const published = []
const consumed = []

const api = new Elysia()
  .use(messaging({ registry, bus, hooks: {
    onPublish: (t, e) => published.push(e)
  }}))

const worker = new Elysia()
  .use(messagingConsumers({
    consumers: [createConsumer(registry, {
      topic: 'test',
      handler: (e) => consumed.push(e)
    })]
  }))

await api.messaging.publish('test', payload)
await sleep(100)

expect(published).toHaveLength(1)
expect(consumed).toHaveLength(1)
```

---

## Performance Considerations

### Publishing
- **Validação:** ~0.1ms (TypeBox)
- **Serialização:** ~0.05ms (JSON.stringify)
- **Redis XADD:** ~1-5ms (network)
- **Total:** ~1-6ms por mensagem

**Otimizações:**
- Desabilitar validação: `validate: false` (não recomendado)
- Batching: `publishBatch()` (v0.3+)
- Pipelining no adapter

### Consuming
- **Polling:** XREADGROUP com BLOCK=5000ms
- **Validação:** ~0.1ms por mensagem
- **Dedupe check:** ~1ms (Redis GET)
- **Handler:** depende da lógica

**Otimizações:**
- Aumentar `blockMs` para reduzir polling
- Processar mensagens em paralelo (dentro do handler)
- Consumer groups para load balancing

---

## Security Considerations

### Validação de Payload
- **Sempre valide no consumer** (mesmo se publicado pelo próprio app)
- **Use schemas estritos** (min/max lengths, formats)
- **Sanitize inputs** antes de processar

### Idempotency
- **Use eventId globalmente único** (UUID v4)
- **TTL adequado** (balance memória vs segurança)
- **Proteja dedupe store** (não expor via API)

### Observability
- **Não logue payloads sensíveis** em hooks
- **Redact PII** antes de enviar para Sentry/logs
- **Use correlationId** para tracing (não log full payload)

---

## Extensibility

### Custom Validator

```typescript
import { z } from 'zod'

const zodValidator: SchemaValidator = {
  validate: (schema, data) => schema.parse(data)
}

const registry = createTopicRegistry(topics, { validator: zodValidator })
```

### Custom Adapter

```typescript
class MyCustomBus implements MessageBus {
  async publish(topic, envelope) {
    // Sua implementação
  }
  
  async close() {
    // Cleanup
  }
}
```

### Custom Hooks

```typescript
messaging({
  registry,
  bus,
  hooks: {
    onPublish: async (topic, envelope) => {
      // Seu código de observabilidade
      await myMetrics.record(...)
      await myTracer.trace(...)
    }
  }
})
```

---

## Conclusão

A arquitetura prioriza:
1. **Type-Safety:** Compile-time guarantees
2. **Separation of Concerns:** Core, Adapters, Plugins
3. **Extensibility:** Fácil adicionar brokers, validators, hooks
4. **Simplicity:** API limpa para 80% dos casos
5. **Flexibility:** Customizável para casos avançados

**Trade-off principal:** Complexidade interna (tipos genéricos) para simplicidade externa (DX perfeita).

